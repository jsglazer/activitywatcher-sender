import { describe, expect, it } from "vitest";
import { AwClient } from "../src/core/awClient.js";
import type { HeartbeatData } from "../src/core/types.js";
import { FakeServer } from "./fakeServer.js";

const URL_OK = "http://127.0.0.1:5600";
const data: HeartbeatData = {
  view: "library",
  library: "My Library",
  collection: "My Library",
  collection_key: "",
  row: "library",
  item_key: "",
  item_title: "",
  attachment_key: "",
  attachment_name: "",
  ambiguous: 0,
};

describe("AwClient", () => {
  it("discovers the hostname from /api/0/info", async () => {
    const s = new FakeServer();
    const r = await new AwClient(s.fetch).getHostname(URL_OK);
    expect(r).toEqual({ ok: true, value: "MBA24.local" });
    expect(s.calls[0]).toMatchObject({
      url: "http://127.0.0.1:5600/api/0/info",
      method: "GET",
    });
  });

  it("creates the bucket with client/type/hostname; 200 and 304 are both success", async () => {
    const s = new FakeServer();
    const c = new AwClient(s.fetch);
    expect(
      await c.ensureBucket(URL_OK, "aw-watcher-zotero_MBA24.local", "MBA24.local"),
    ).toEqual({ ok: true, value: true });
    expect(
      await c.ensureBucket(URL_OK, "aw-watcher-zotero_MBA24.local", "MBA24.local"),
    ).toEqual({ ok: true, value: true });
    expect(s.calls[0]).toMatchObject({
      url: "http://127.0.0.1:5600/api/0/buckets/aw-watcher-zotero_MBA24.local",
      method: "POST",
      body: {
        client: "activitywatcher-sender",
        type: "app.zotero.activity",
        hostname: "MBA24.local",
      },
    });
  });

  it("reports a bucket-creation HTTP error", async () => {
    const s = new FakeServer();
    s.bucketStatusOverride = 500;
    const r = await new AwClient(s.fetch).ensureBucket(URL_OK, "b", "h");
    expect(r.ok).toBe(false);
  });

  it("posts the heartbeat with pulsetime in the query string", async () => {
    const s = new FakeServer();
    s.buckets.add("b");
    const ev = { timestamp: "2026-11-04T12:00:00.000Z", duration: 0, data };
    const r = await new AwClient(s.fetch).heartbeat(URL_OK, "b", 30, ev);
    expect(r.ok).toBe(true);
    expect(s.calls[0]).toMatchObject({
      url: "http://127.0.0.1:5600/api/0/buckets/b/heartbeat?pulsetime=30",
      method: "POST",
      body: ev,
    });
  });

  it("resolves (never throws) when the server is down", async () => {
    const s = new FakeServer();
    s.up = false;
    const c = new AwClient(s.fetch);
    await expect(c.getHostname(URL_OK)).resolves.toMatchObject({ ok: false });
    await expect(c.ensureBucket(URL_OK, "b", "h")).resolves.toMatchObject({ ok: false });
    await expect(
      c.heartbeat(URL_OK, "b", 30, { timestamp: "", duration: 0, data }),
    ).resolves.toMatchObject({ ok: false });
  });

  it("refuses a non-loopback URL without making any request", async () => {
    const s = new FakeServer();
    const r = await new AwClient(s.fetch).getHostname("http://example.com:5600");
    expect(r.ok).toBe(false);
    expect(s.calls).toHaveLength(0);
  });

  it("handles invalid JSON from /info", async () => {
    const c = new AwClient(async () => ({
      status: 200,
      json: async () => {
        throw new SyntaxError("bad");
      },
    }));
    expect((await c.getHostname(URL_OK)).ok).toBe(false);
  });
});
