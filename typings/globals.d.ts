/**
 * Ambient declarations for the plugin sandbox. Nothing in src/core uses these.
 */
declare const rootURI: string;

declare namespace Zotero {
  const ActivityWatcherSender: typeof import("../src/index.js").default;
}
