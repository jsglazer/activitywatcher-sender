/**
 * Server URL validation and aw-server REST paths. Only loopback hosts are ever
 * accepted, so library titles can never leave this computer.
 */

export const DEFAULT_SERVER_URL = "http://127.0.0.1:5600";
export const DEFAULT_INTERVAL_SECONDS = 15;
export const MIN_INTERVAL_SECONDS = 5;
export const MAX_INTERVAL_SECONDS = 120;
/** Slack added to the interval to form the heartbeat pulsetime. */
export const PULSETIME_SLACK_SECONDS = 15;

export const BUCKET_PREFIX = "aw-watcher-zotero_";
export const BUCKET_TYPE = "app.zotero.activity";
export const CLIENT_NAME = "activitywatcher-sender";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export type ServerCheck = { ok: true; base: string } | { ok: false; reason: string };

/** Validate a server URL; returns its base (no trailing slash) when usable. */
export function checkServerURL(raw: string): ServerCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: `not a valid URL: ${raw}` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `unsupported protocol ${url.protocol}` };
  }
  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
    return {
      ok: false,
      reason: `server must be on this computer (127.0.0.1 or localhost), not ${url.hostname}`,
    };
  }
  if (url.username || url.password || url.search || url.hash) {
    return {
      ok: false,
      reason: "server URL must not contain credentials, a query or a fragment",
    };
  }
  const path = url.pathname.replace(/\/+$/, "");
  return { ok: true, base: `${url.protocol}//${url.host}${path}` };
}

export function clampInterval(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_SECONDS;
  return Math.min(MAX_INTERVAL_SECONDS, Math.max(MIN_INTERVAL_SECONDS, Math.round(n)));
}

export function pulsetime(intervalSeconds: number): number {
  return intervalSeconds + PULSETIME_SLACK_SECONDS;
}

export function bucketId(hostname: string): string {
  return BUCKET_PREFIX + hostname;
}

export function infoURL(base: string): string {
  return `${base}/api/0/info`;
}

export function bucketURL(base: string, bucket: string): string {
  return `${base}/api/0/buckets/${encodeURIComponent(bucket)}`;
}

export function heartbeatURL(base: string, bucket: string, pulse: number): string {
  return `${bucketURL(base, bucket)}/heartbeat?pulsetime=${pulse}`;
}
