/**
 * The tick loop: read the snapshot, make sure the bucket exists, send one
 * heartbeat. Clock, timers, snapshot reader, settings and logger are all
 * injected, so the whole state machine runs under fake timers in tests.
 *
 * - One tick every `intervalSeconds`; `trigger()` runs one immediately
 *   (several triggers before it runs coalesce into one).
 * - Ticks never overlap; a trigger that arrives mid-tick runs once afterwards.
 * - While aw-server is unreachable heartbeats are dropped and bucket creation
 *   is retried with backoff 15 s, 30 s, 60 s … capped at 5 min; the outage is
 *   logged once, not on every tick.
 * - `stop()` clears every timer; nothing is rescheduled after it.
 */
import type { AwClient } from "./awClient.js";
import { buildHeartbeatData } from "./context.js";
import { bucketId, clampInterval, pulsetime } from "./url.js";
import type { Settings, Snapshot } from "./types.js";

export const BACKOFF_START_MS = 15_000;
export const BACKOFF_MAX_MS = 300_000;

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SenderDeps {
  client: AwClient;
  readSnapshot: () => Snapshot | null;
  getSettings: () => Settings;
  now: () => number;
  timers: Timers;
  log: (message: string) => void;
}

export interface SenderStatus {
  running: boolean;
  bucket: string | null;
  lastSuccess: number | null;
  lastError: string | null;
}

export class Sender {
  private running = false;
  private tickTimer: unknown = null;
  private triggerTimer: unknown = null;
  private inFlight = false;
  private rerun = false;

  // Bucket state for the server URL it was confirmed against.
  private confirmedFor: string | null = null;
  private bucket: string | null = null;
  private retryAt = 0;
  private backoffMs = 0;
  private outageLogged = false;

  private lastSuccess: number | null = null;
  private lastError: string | null = null;

  constructor(private readonly deps: SenderDeps) {}

  start(): void {
    if (this.running) return; // a second start must not double the timers
    this.running = true;
    this.trigger();
  }

  stop(): void {
    this.running = false;
    this.rerun = false;
    if (this.tickTimer !== null) this.deps.timers.clearTimeout(this.tickTimer);
    if (this.triggerTimer !== null) this.deps.timers.clearTimeout(this.triggerTimer);
    this.tickTimer = null;
    this.triggerTimer = null;
  }

  /** Run a tick as soon as possible (coalesced). */
  trigger(): void {
    if (!this.running) return;
    if (this.inFlight) {
      this.rerun = true;
      return;
    }
    if (this.triggerTimer !== null) return;
    this.triggerTimer = this.deps.timers.setTimeout(() => {
      this.triggerTimer = null;
      void this.tick();
    }, 0);
  }

  status(): SenderStatus {
    return {
      running: this.running,
      bucket: this.bucket,
      lastSuccess: this.lastSuccess,
      lastError: this.lastError,
    };
  }

  /** Run one tick now. Exposed for tests; normal callers use start()/trigger(). */
  async tick(): Promise<void> {
    if (!this.running || this.inFlight) return;
    this.inFlight = true;
    if (this.tickTimer !== null) {
      this.deps.timers.clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    try {
      await this.sendOnce();
    } catch (e) {
      // Defensive: sendOnce is written not to throw, but never let anything
      // escape into Zotero.
      this.fail(`unexpected error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.inFlight = false;
    }
    if (!this.running) return;
    if (this.rerun) {
      this.rerun = false;
      this.trigger();
      return;
    }
    const interval = clampInterval(this.deps.getSettings().intervalSeconds);
    this.tickTimer = this.deps.timers.setTimeout(() => {
      this.tickTimer = null;
      void this.tick();
    }, interval * 1000);
  }

  private async sendOnce(): Promise<void> {
    const settings = this.deps.getSettings();
    if (!settings.enabled) return;
    const serverURL = settings.serverURL;

    if (this.confirmedFor !== serverURL) {
      this.confirmedFor = null;
      this.bucket = null;
      if (this.deps.now() < this.retryAt) return; // in backoff: drop this heartbeat
      const host = await this.deps.client.getHostname(serverURL);
      if (!host.ok) return this.fail(host.error);
      const bucket = bucketId(host.value);
      const created = await this.deps.client.ensureBucket(serverURL, bucket, host.value);
      if (!created.ok) return this.fail(created.error);
      this.confirmedFor = serverURL;
      this.bucket = bucket;
    }

    const snapshot = this.deps.readSnapshot();
    if (snapshot === null || this.bucket === null) return;
    const data = buildHeartbeatData(snapshot, { sendTitles: settings.sendTitles });
    const interval = clampInterval(settings.intervalSeconds);
    const sent = await this.deps.client.heartbeat(
      serverURL,
      this.bucket,
      pulsetime(interval),
      {
        timestamp: new Date(this.deps.now()).toISOString(),
        duration: 0,
        data,
      },
    );
    if (!sent.ok) {
      // The bucket may have been deleted or the server restarted: re-confirm.
      this.confirmedFor = null;
      return this.fail(sent.error);
    }
    this.succeed();
  }

  private succeed(): void {
    if (this.outageLogged) this.deps.log("ActivityWatch reachable again");
    this.outageLogged = false;
    this.backoffMs = 0;
    this.retryAt = 0;
    this.lastSuccess = this.deps.now();
    this.lastError = null;
  }

  private fail(error: string): void {
    this.lastError = error;
    this.backoffMs =
      this.backoffMs === 0
        ? BACKOFF_START_MS
        : Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
    this.retryAt = this.deps.now() + this.backoffMs;
    if (!this.outageLogged) {
      this.deps.log(`heartbeats paused: ${error}`);
      this.outageLogged = true;
    }
  }
}
