/**
 * Typed preference access. One module owns the keys and defaults (which must
 * match addon/prefs.js); nothing else reads Zotero.Prefs.
 */
import {
  DEFAULT_INTERVAL_SECONDS,
  DEFAULT_SERVER_URL,
  clampInterval,
} from "../core/url.js";
import type { Settings } from "../core/types.js";

export const PREF_BRANCH = "extensions.activitywatcher-sender";

export const PREF_KEYS = {
  enabled: `${PREF_BRANCH}.enabled`,
  serverURL: `${PREF_BRANCH}.serverURL`,
  intervalSeconds: `${PREF_BRANCH}.intervalSeconds`,
  sendTitles: `${PREF_BRANCH}.sendTitles`,
} as const;

function get(key: string): unknown {
  try {
    // global = true: the key is a full pref name, not under extensions.zotero.
    return (Zotero.Prefs.get as (k: string, global: boolean) => unknown)(key, true);
  } catch {
    return undefined;
  }
}

export function readSettings(): Settings {
  const enabled = get(PREF_KEYS.enabled);
  const serverURL = get(PREF_KEYS.serverURL);
  const sendTitles = get(PREF_KEYS.sendTitles);
  return {
    enabled: typeof enabled === "boolean" ? enabled : true,
    serverURL:
      typeof serverURL === "string" && serverURL.trim() ? serverURL : DEFAULT_SERVER_URL,
    intervalSeconds: clampInterval(
      get(PREF_KEYS.intervalSeconds) ?? DEFAULT_INTERVAL_SECONDS,
    ),
    sendTitles: typeof sendTitles === "boolean" ? sendTitles : true,
  };
}

/** Observe every plugin pref; returns an unsubscribe function. */
export function observePrefs(onChange: () => void): () => void {
  const ids: symbol[] = [];
  for (const key of Object.values(PREF_KEYS)) {
    try {
      ids.push(Zotero.Prefs.registerObserver(key, onChange, true) as symbol);
    } catch {
      // An unobservable pref is still read fresh on the next tick.
    }
  }
  return () => {
    for (const id of ids) {
      try {
        Zotero.Prefs.unregisterObserver(id);
      } catch {
        // Already gone.
      }
    }
    ids.length = 0;
  };
}
