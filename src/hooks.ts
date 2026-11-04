/**
 * Lifecycle wiring — the only place that registers anything with Zotero.
 * Every registration made in onStartup has a matching removal in onShutdown:
 *
 *   sender timers        → sender.stop()
 *   Notifier "tab"       → Zotero.Notifier.unregisterObserver(notifierID)
 *   pref observers       → stopPrefs()
 *   collection listeners → each window's unsubscribe in windowUnsubscribers
 *   preference pane      → Zotero.PreferencePanes.unregister(paneID)
 *
 * A second onStartup without onShutdown first tears the previous instance
 * down, so timers are never doubled.
 */
import { AwClient } from "./core/awClient.js";
import { Sender } from "./core/sender.js";
import type { SenderStatus } from "./core/sender.js";
import { sandboxFetch } from "./adapters/http.js";
import { observePrefs, readSettings } from "./adapters/prefs.js";
import { onCollectionSelect, readSnapshot } from "./adapters/zoteroState.js";

const PLUGIN_ID = "activitywatcher-sender@jsglazer.com";
const LOG_PREFIX = "[activitywatcher-sender] ";

let sender: Sender | null = null;
let notifierID: string | null = null;
let stopPrefs: (() => void) | null = null;
let paneID: string | null = null;
let paneRegistration: Promise<string> | null = null;
const windowUnsubscribers = new Map<unknown, () => void>();

function log(message: string): void {
  Zotero.debug(LOG_PREFIX + message);
}

function attachWindow(win: unknown): void {
  if (!sender || !win || windowUnsubscribers.has(win)) return;
  const s = sender;
  windowUnsubscribers.set(
    win,
    onCollectionSelect(win, () => s.trigger()),
  );
}

function detachWindow(win: unknown): void {
  windowUnsubscribers.get(win)?.();
  windowUnsubscribers.delete(win);
}

export async function onStartup(rootURI: string): Promise<void> {
  await Zotero.initializationPromise;
  if (sender) onShutdown();

  const s = new Sender({
    client: new AwClient(sandboxFetch),
    readSnapshot,
    getSettings: readSettings,
    now: () => Date.now(),
    timers: {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    log,
  });
  sender = s;

  // Tab switches (library ⇄ reader, reader ⇄ reader) send immediately.
  notifierID = Zotero.Notifier.registerObserver(
    {
      notify: async (event: string, type: string) => {
        if (type === "tab" && event === "select") s.trigger();
      },
    },
    ["tab"],
    "activitywatcher-sender",
  );

  stopPrefs = observePrefs(() => s.trigger());

  const win = Zotero.getMainWindow();
  if (win) attachWindow(win);

  paneRegistration = Zotero.PreferencePanes.register({
    pluginID: PLUGIN_ID,
    src: rootURI + "chrome/content/preferences.xhtml",
    scripts: [rootURI + "chrome/content/preferences.js"],
    label: "ActivityWatcher Sender",
    image: "chrome://activitywatcher-sender/content/icons/icon-20.svg",
  });
  paneRegistration.then(
    (id) => {
      // If shutdown already ran, drop the pane we just got back.
      if (sender === s) paneID = id;
      else safeUnregisterPane(id);
    },
    (e) => log(`preference pane not registered: ${e}`),
  );

  s.start();
  log("started");
}

function safeUnregisterPane(id: string): void {
  try {
    Zotero.PreferencePanes.unregister(id);
  } catch {
    // Zotero also unregisters panes automatically when the plugin shuts down.
  }
}

export function onShutdown(): void {
  sender?.stop();
  sender = null;
  if (notifierID !== null) {
    try {
      Zotero.Notifier.unregisterObserver(notifierID);
    } catch {
      // Already gone.
    }
    notifierID = null;
  }
  stopPrefs?.();
  stopPrefs = null;
  for (const win of [...windowUnsubscribers.keys()]) detachWindow(win);
  if (paneID !== null) safeUnregisterPane(paneID);
  paneID = null;
  paneRegistration = null;
  log("stopped");
}

export function onMainWindowLoad(win: unknown): void {
  attachWindow(win);
  sender?.trigger();
}

export function onMainWindowUnload(win: unknown): void {
  detachWindow(win);
}

export function getStatus(): SenderStatus | null {
  return sender?.status() ?? null;
}

/** One-line status for the preference pane. */
export function getStatusText(): string {
  const st = getStatus();
  if (!st) return "Not running.";
  const settings = readSettings();
  if (!settings.enabled) return "Sending is turned off.";
  if (st.lastError) return `Not sending: ${st.lastError}`;
  if (st.lastSuccess === null) return "Starting…";
  const secs = Math.max(0, Math.round((Date.now() - st.lastSuccess) / 1000));
  return `Last heartbeat ${secs} s ago to bucket ${st.bucket}.`;
}
