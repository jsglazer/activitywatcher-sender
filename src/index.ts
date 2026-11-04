/**
 * Bundle entry point. bootstrap.js loads the built script into the plugin
 * sandbox and calls these hooks; nothing here runs at import time except
 * publishing the instance on the Zotero object.
 */
import {
  getStatus,
  getStatusText,
  onMainWindowLoad,
  onMainWindowUnload,
  onShutdown,
  onStartup,
} from "./hooks.js";

const instance = {
  hooks: { onStartup, onShutdown, onMainWindowLoad, onMainWindowUnload },
  getStatus,
  getStatusText,
};

// Reachable from bootstrap.js, the preference pane script, and
// Tools → Developer → Run JavaScript (Zotero.ActivityWatcherSender.getStatus()).
(Zotero as unknown as Record<string, unknown>).ActivityWatcherSender = instance;

export default instance;
