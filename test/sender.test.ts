import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AwClient } from "../src/core/awClient.js";
import { BACKOFF_MAX_MS, Sender } from "../src/core/sender.js";
import type { Settings, Snapshot } from "../src/core/types.js";
import { FakeServer } from "./fakeServer.js";
import { RD_CHAIN, collectionRow, librarySnap } from "./fixtures.js";

const START = Date.UTC(2026, 10, 4, 12, 0, 0);

function setup(overrides: Partial<Settings> = {}) {
  const server = new FakeServer();
  const settings: Settings = {
    enabled: true,
    serverURL: "http://127.0.0.1:5600",
    intervalSeconds: 15,
    sendTitles: true,
    ...overrides,
  };
  let snapshot: Snapshot | null = librarySnap([collectionRow(RD_CHAIN)]);
  const logs: string[] = [];
  const sender = new Sender({
    client: new AwClient(server.fetch),
    readSnapshot: () => snapshot,
    getSettings: () => settings,
    now: () => Date.now(),
    timers: {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as never),
    },
    log: (m) => logs.push(m),
  });
  return {
    server,
    settings,
    sender,
    logs,
    setSnapshot: (s: Snapshot | null) => {
      snapshot = s;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Sender", () => {
  it("creates the bucket once, then sends one heartbeat per interval", async () => {
    const { server, sender } = setup();
    sender.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.buckets.has("aw-watcher-zotero_MBA24.local")).toBe(true);
    expect(server.heartbeats()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(15_000 * 4);
    expect(server.heartbeats()).toHaveLength(5);
    expect(server.calls.filter((c) => c.url.endsWith("/api/0/info"))).toHaveLength(1);
    const hb = server.heartbeats()[0];
    expect(hb.url).toContain("pulsetime=30");
    expect(hb.body).toMatchObject({ timestamp: "2026-11-04T12:00:00.000Z", duration: 0 });
    expect(sender.status()).toMatchObject({
      lastError: null,
      bucket: "aw-watcher-zotero_MBA24.local",
    });
    sender.stop();
  });

  it("heartbeat data is identical tick to tick for an unchanged context", async () => {
    const { server, sender } = setup();
    sender.start();
    await vi.advanceTimersByTimeAsync(45_000);
    const datas = server
      .heartbeats()
      .map((c) => JSON.stringify((c.body as { data: unknown }).data));
    expect(new Set(datas).size).toBe(1);
    sender.stop();
  });

  it("coalesces several triggers into one immediate tick", async () => {
    const { server, sender } = setup();
    sender.start();
    await vi.advanceTimersByTimeAsync(0);
    sender.trigger();
    sender.trigger();
    sender.trigger();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.heartbeats()).toHaveLength(2);
    sender.stop();
  });

  it("a trigger during an in-flight tick runs exactly once afterwards", async () => {
    const { server, sender } = setup();
    sender.start();
    await vi.advanceTimersByTimeAsync(0);
    const tick = sender.tick(); // in flight
    sender.trigger();
    sender.trigger();
    await tick;
    await vi.advanceTimersByTimeAsync(0);
    expect(server.heartbeats()).toHaveLength(3);
    sender.stop();
  });

  it("start() twice does not double the timers", async () => {
    const { server, sender } = setup();
    sender.start();
    sender.start();
    await vi.advanceTimersByTimeAsync(15_000 * 2);
    expect(server.heartbeats()).toHaveLength(3);
    sender.stop();
  });

  it("backs off 15 s, 30 s, 60 s … capped at 5 min while down, logging once, then recovers", async () => {
    const { server, sender, logs } = setup();
    server.up = false;
    sender.start();
    await vi.advanceTimersByTimeAsync(0);
    const attempts = () =>
      server.calls.filter((c) => c.url.endsWith("/api/0/info")).length;
    expect(attempts()).toBe(1);

    // Attempts happen on the first tick at/after each retry time.
    const seen: number[] = [];
    for (let t = 0; t < 40 * 60_000; t += 15_000) {
      const before = attempts();
      await vi.advanceTimersByTimeAsync(15_000);
      if (attempts() > before) seen.push(Date.now() - START);
    }
    const gaps = seen.map((t, i) => t - (i === 0 ? 0 : seen[i - 1]));
    expect(gaps.slice(0, 4)).toEqual([15_000, 30_000, 60_000, 120_000]);
    expect(Math.max(...gaps)).toBe(BACKOFF_MAX_MS);
    expect(logs.filter((l) => l.startsWith("heartbeats paused"))).toHaveLength(1);
    expect(server.heartbeats()).toHaveLength(0);
    expect(sender.status().lastError).toMatch(/not reachable/);

    server.up = true;
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS + 15_000);
    expect(server.heartbeats().length).toBeGreaterThan(0);
    expect(logs).toContain("ActivityWatch reachable again");
    expect(sender.status().lastError).toBeNull();
    sender.stop();
  });

  it("re-confirms the bucket after a failed heartbeat (e.g. bucket deleted)", async () => {
    const { server, sender } = setup();
    sender.start();
    await vi.advanceTimersByTimeAsync(0);
    server.buckets.clear();
    await vi.advanceTimersByTimeAsync(15_000); // heartbeat 404 → fail
    expect(sender.status().lastError).toMatch(/HTTP 404/);
    await vi.advanceTimersByTimeAsync(15_000); // retry: recreate bucket + heartbeat
    expect(server.buckets.size).toBe(1);
    expect(sender.status().lastError).toBeNull();
    sender.stop();
  });

  it("sends nothing after stop()", async () => {
    const { server, sender } = setup();
    sender.start();
    await vi.advanceTimersByTimeAsync(0);
    sender.stop();
    const n = server.calls.length;
    sender.trigger();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(server.calls.length).toBe(n);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("disabled: no requests, keeps ticking so re-enabling resumes", async () => {
    const { server, sender, settings } = setup({ enabled: false });
    sender.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.calls).toHaveLength(0);
    settings.enabled = true;
    sender.trigger();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.heartbeats()).toHaveLength(1);
    sender.stop();
  });

  it("non-loopback server URL: never makes a request", async () => {
    const { server, sender } = setup({ serverURL: "http://example.com:5600" });
    sender.start();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(server.calls).toHaveLength(0);
    expect(sender.status().lastError).toMatch(/this computer/);
    sender.stop();
  });

  it("no snapshot (no main window): bucket confirmed, no heartbeat", async () => {
    const { server, sender, setSnapshot } = setup();
    setSnapshot(null);
    sender.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.heartbeats()).toHaveLength(0);
    sender.stop();
  });
});
