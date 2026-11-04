/**
 * Snapshot → heartbeat data. Pure and deterministic: the same snapshot always
 * gives a byte-identical object (fixed key set and order, no time-varying
 * fields), which is what lets aw-server merge consecutive heartbeats.
 */
import { chooseDeepest } from "./deepest.js";
import { collectionPath, commonChain, escapeSegment } from "./path.js";
import type { HeartbeatData, SelectedRow, Snapshot, View } from "./types.js";

interface PaneContext {
  library: string;
  collection: string;
  collectionKey: string;
  row: string;
  /** Path of the selected collection, used as the reader tie-break preference. */
  selectedPath: string | null;
}

/** Fixed key order — see HeartbeatData. Every field always present. */
function makeData(view: View, fields: Partial<HeartbeatData>): HeartbeatData {
  return {
    view,
    library: fields.library ?? "",
    collection: fields.collection ?? "",
    collection_key: fields.collection_key ?? "",
    row: fields.row ?? "",
    item_key: fields.item_key ?? "",
    item_title: fields.item_title ?? "",
    attachment_key: fields.attachment_key ?? "",
    attachment_name: fields.attachment_name ?? "",
    ambiguous: fields.ambiguous ?? 0,
  };
}

function rowLabel(row: SelectedRow): string {
  if (row.kind === "search") return `search:${row.searchName ?? ""}`;
  return row.kind;
}

/** What the library pane has selected, as path/row fields. */
export function paneContext(rows: SelectedRow[]): PaneContext {
  if (rows.length === 0) {
    return {
      library: "",
      collection: "",
      collectionKey: "",
      row: "",
      selectedPath: null,
    };
  }
  const first = rows[0];
  const library = escapeSegment(first.libraryName);

  if (rows.length > 1) {
    const sameLibrary = rows.every((r) => r.libraryName === first.libraryName);
    const chains = rows.map((r) => (r.kind === "collection" && r.chain ? r.chain : []));
    const common = sameLibrary ? commonChain(chains) : [];
    const last = common[common.length - 1];
    return {
      library,
      collection: common.length > 0 ? collectionPath(first.libraryName, common) : library,
      collectionKey: last ? last.key : "",
      row: "multiple",
      selectedPath: null,
    };
  }

  if (first.kind === "collection" && first.chain && first.chain.length > 0) {
    const path = collectionPath(first.libraryName, first.chain);
    return {
      library,
      collection: path,
      collectionKey: first.chain[first.chain.length - 1].key,
      row: "collection",
      selectedPath: path,
    };
  }

  return {
    library,
    collection: library,
    collectionKey: "",
    row: rowLabel(first),
    selectedPath: null,
  };
}

export function buildHeartbeatData(
  snapshot: Snapshot,
  options: { sendTitles: boolean },
): HeartbeatData {
  const pane = paneContext(snapshot.selectedRows);

  if (snapshot.view === "reader" && snapshot.reader) {
    const r = snapshot.reader;
    const library = escapeSegment(r.libraryName);
    const choice = chooseDeepest(r.libraryName, r.collections, pane.selectedPath);
    const titles = options.sendTitles
      ? { item_title: r.itemTitle, attachment_name: r.attachmentName }
      : {};
    if (choice === null) {
      return makeData("reader", {
        library,
        collection: library,
        row: "unfiled",
        item_key: r.itemKey,
        attachment_key: r.attachmentKey,
        ...titles,
      });
    }
    return makeData("reader", {
      library,
      collection: choice.path,
      collection_key: choice.chain[choice.chain.length - 1].key,
      row: "collection",
      item_key: r.itemKey,
      attachment_key: r.attachmentKey,
      ...titles,
      ambiguous: choice.ambiguous,
    });
  }

  // Library view, and any other tab type (e.g. a note tab), report the
  // library pane's context and never any item fields, so browsing within one
  // collection stays one merged event.
  const view: View = snapshot.view === "reader" ? "other" : snapshot.view;
  return makeData(view, {
    library: pane.library,
    collection: pane.collection,
    collection_key: pane.collectionKey,
    row: pane.row,
  });
}
