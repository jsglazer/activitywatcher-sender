import { describe, expect, it } from "vitest";
import {
  bucketId,
  checkServerURL,
  clampInterval,
  heartbeatURL,
  pulsetime,
} from "../src/core/url.js";

describe("checkServerURL", () => {
  it.each([
    ["http://127.0.0.1:5600", "http://127.0.0.1:5600"],
    ["http://localhost:5600/", "http://localhost:5600"],
    ["http://[::1]:5600", "http://[::1]:5600"],
    ["  http://LOCALHOST:5666  ", "http://localhost:5666"],
    ["https://127.0.0.1:5600/aw", "https://127.0.0.1:5600/aw"],
  ])("accepts loopback %s", (raw, base) => {
    expect(checkServerURL(raw)).toEqual({ ok: true, base });
  });

  it.each([
    "http://192.168.1.10:5600",
    "http://example.com:5600",
    "http://127.0.0.1.evil.com:5600",
    "http://user:pw@127.0.0.1:5600",
    "http://127.0.0.1:5600/?x=1",
    "ftp://127.0.0.1:5600",
    "127.0.0.1:5600",
    "not a url",
    "",
  ])("rejects %s", (raw) => {
    expect(checkServerURL(raw).ok).toBe(false);
  });
});

describe("helpers", () => {
  it("clamps the interval to 5–120 s and defaults bad input to 15", () => {
    expect(clampInterval(1)).toBe(5);
    expect(clampInterval(500)).toBe(120);
    expect(clampInterval("30")).toBe(30);
    expect(clampInterval("x")).toBe(15);
    expect(clampInterval(undefined)).toBe(15);
  });

  it("pulsetime is interval + 15", () => {
    expect(pulsetime(15)).toBe(30);
  });

  it("builds the bucket id and heartbeat URL", () => {
    expect(bucketId("MBA24.local")).toBe("aw-watcher-zotero_MBA24.local");
    expect(
      heartbeatURL("http://127.0.0.1:5600", "aw-watcher-zotero_MBA24.local", 30),
    ).toBe(
      "http://127.0.0.1:5600/api/0/buckets/aw-watcher-zotero_MBA24.local/heartbeat?pulsetime=30",
    );
  });
});
