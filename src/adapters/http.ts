/**
 * The real transport: the platform `fetch` of the plugin sandbox.
 *
 * Not Zotero.HTTP.request — it refuses every request, loopback included,
 * while Zotero believes it is offline. AbortController is not a sandbox
 * global, so it is borrowed from the main window when one exists; without it
 * the request simply runs without a timeout.
 */
import type { FetchLike } from "../core/awClient.js";

const TIMEOUT_MS = 3000;

type AbortControllerCtor = new () => { signal: unknown; abort(): void };

function abortControllerCtor(): AbortControllerCtor | null {
  try {
    const win = Zotero.getMainWindow() as unknown as {
      AbortController?: AbortControllerCtor;
    };
    return win?.AbortController ?? null;
  } catch {
    return null;
  }
}

export const sandboxFetch: FetchLike = async (url, init) => {
  const Ctor = abortControllerCtor();
  const controller = Ctor ? new Ctor() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      ...(controller ? { signal: controller.signal as AbortSignal } : {}),
    });
    return { status: res.status, json: () => res.json() as Promise<unknown> };
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
};
