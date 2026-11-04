/**
 * Plain data shapes shared by the pure core. The Zotero adapter fills a
 * `Snapshot`; everything downstream works on these objects only.
 */

/** One collection, as needed to build its path. */
export interface CollectionRecord {
  key: string;
  name: string;
}

/** A collection chain from the top-level collection down to the collection itself. */
export type CollectionChain = CollectionRecord[];

/** What a selected row in the library pane is. */
export type RowKind =
  | "collection"
  | "library"
  | "unfiled"
  | "duplicates"
  | "trash"
  | "search"
  | "publications"
  | "feed"
  | "other";

export interface SelectedRow {
  kind: RowKind;
  /** "My Library", a group name, or a feed name. */
  libraryName: string;
  /** Only for kind "collection": the chain down to the selected collection. */
  chain?: CollectionChain;
  /** Only for kind "search": the saved search's name. */
  searchName?: string;
}

/** The item open in the selected reader tab. */
export interface ReaderItem {
  libraryName: string;
  /** Key of the parent item, or of the attachment itself when it has no parent. */
  itemKey: string;
  /** Title of the parent item (or of the attachment when it has no parent). */
  itemTitle: string;
  attachmentKey: string;
  /** Attachment file name, else the attachment title. */
  attachmentName: string;
  /** Every (non-deleted) collection the item is in, each as a full chain. */
  collections: CollectionChain[];
}

export type View = "library" | "reader" | "other";

/** Everything the core needs to know about Zotero at one instant. */
export interface Snapshot {
  view: View;
  /** Rows selected in the library pane (one, or several on Zotero 10). */
  selectedRows: SelectedRow[];
  /** Set only when view is "reader". */
  reader: ReaderItem | null;
}

/**
 * The heartbeat `data` object. Key order is fixed and every key is always
 * present, so an unchanged context serialises byte-identically and
 * aw-server merges consecutive heartbeats into one event.
 */
export interface HeartbeatData {
  view: View;
  library: string;
  collection: string;
  collection_key: string;
  row: string;
  item_key: string;
  item_title: string;
  attachment_key: string;
  attachment_name: string;
  ambiguous: number;
}

export interface Settings {
  enabled: boolean;
  serverURL: string;
  intervalSeconds: number;
  sendTitles: boolean;
}
