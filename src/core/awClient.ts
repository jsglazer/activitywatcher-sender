/**
 * aw-server REST calls through an injected `fetch`. Never throws: every call
 * resolves to a result object. The server URL is validated on every call,
 * not only when the preference changes.
 */
import {
  BUCKET_TYPE,
  CLIENT_NAME,
  bucketURL,
  checkServerURL,
  heartbeatURL,
  infoURL,
} from "./url.js";
import type { HeartbeatData } from "./types.js";

export interface FetchResponse {
  status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string },
) => Promise<FetchResponse>;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface HeartbeatEvent {
  timestamp: string;
  duration: number;
  data: HeartbeatData;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class AwClient {
  constructor(private readonly fetchImpl: FetchLike) {}

  private async request(
    serverURL: string,
    toURL: (base: string) => string,
    init: { method: string; body?: unknown },
  ): Promise<Result<FetchResponse>> {
    const check = checkServerURL(serverURL);
    if (!check.ok) return { ok: false, error: check.reason };
    try {
      const res = await this.fetchImpl(toURL(check.base), {
        method: init.method,
        headers: init.body === undefined ? undefined : JSON_HEADERS,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      return { ok: true, value: res };
    } catch (e) {
      return { ok: false, error: `ActivityWatch not reachable: ${describe(e)}` };
    }
  }

  /** The hostname aw-server reports, so the bucket matches the other watchers. */
  async getHostname(serverURL: string): Promise<Result<string>> {
    const res = await this.request(serverURL, infoURL, { method: "GET" });
    if (!res.ok) return res;
    if (res.value.status !== 200) {
      return { ok: false, error: `GET /api/0/info returned HTTP ${res.value.status}` };
    }
    try {
      const body = (await res.value.json()) as { hostname?: unknown };
      if (typeof body?.hostname === "string" && body.hostname.length > 0) {
        return { ok: true, value: body.hostname };
      }
      return { ok: false, error: "GET /api/0/info returned no hostname" };
    } catch (e) {
      return {
        ok: false,
        error: `GET /api/0/info returned invalid JSON: ${describe(e)}`,
      };
    }
  }

  /** Create the bucket. 200 (created) and 304 (already exists) both count as success. */
  async ensureBucket(
    serverURL: string,
    bucket: string,
    hostname: string,
  ): Promise<Result<true>> {
    const res = await this.request(serverURL, (base) => bucketURL(base, bucket), {
      method: "POST",
      body: { client: CLIENT_NAME, type: BUCKET_TYPE, hostname },
    });
    if (!res.ok) return res;
    const s = res.value.status;
    if ((s >= 200 && s < 300) || s === 304) return { ok: true, value: true };
    return { ok: false, error: `creating bucket ${bucket} returned HTTP ${s}` };
  }

  async heartbeat(
    serverURL: string,
    bucket: string,
    pulse: number,
    event: HeartbeatEvent,
  ): Promise<Result<true>> {
    const res = await this.request(
      serverURL,
      (base) => heartbeatURL(base, bucket, pulse),
      {
        method: "POST",
        body: event,
      },
    );
    if (!res.ok) return res;
    const s = res.value.status;
    if (s >= 200 && s < 300) return { ok: true, value: true };
    return { ok: false, error: `heartbeat returned HTTP ${s}` };
  }
}
