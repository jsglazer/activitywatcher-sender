import type { FetchLike } from "../src/core/awClient.js";

export interface Call {
  url: string;
  method: string;
  body: unknown;
}

/** In-memory stand-in for aw-server. Never touches the network. */
export class FakeServer {
  calls: Call[] = [];
  up = true;
  hostname = "MBA24.local";
  buckets = new Set<string>();
  bucketStatusOverride: number | null = null;
  heartbeatStatus = 200;

  fetch: FetchLike = async (url, init) => {
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    this.calls.push({ url, method: init.method, body });
    if (!this.up) throw new TypeError("NetworkError when attempting to fetch resource.");
    const path = new URL(url).pathname;
    const respond = (status: number, json: unknown = {}) => ({
      status,
      json: async () => json,
    });
    if (path.endsWith("/api/0/info")) return respond(200, { hostname: this.hostname });
    const hb = path.match(/\/api\/0\/buckets\/([^/]+)\/heartbeat$/);
    if (hb) {
      if (!this.buckets.has(decodeURIComponent(hb[1]))) return respond(404);
      return respond(this.heartbeatStatus);
    }
    const b = path.match(/\/api\/0\/buckets\/([^/]+)$/);
    if (b && init.method === "POST") {
      if (this.bucketStatusOverride !== null) return respond(this.bucketStatusOverride);
      const id = decodeURIComponent(b[1]);
      if (this.buckets.has(id)) return respond(304);
      this.buckets.add(id);
      return respond(200);
    }
    return respond(404);
  };

  heartbeats(): Call[] {
    return this.calls.filter((c) => c.url.includes("/heartbeat"));
  }
}
