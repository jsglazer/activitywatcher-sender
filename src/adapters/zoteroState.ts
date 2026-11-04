/**
 * The ONLY module that reads Zotero's UI state. It turns the selected tab,
 * the reader's item and the library-pane selection into a plain `Snapshot`
 * for the pure core. Everything here is defensive: these are undocumented
 * internals (Zotero_Tabs, collection-tree rows) that change between Zotero
 * versions, so any failure degrades to "less context", never to an exception.
 *
 * Targets Zotero 7.0–10.*:
 * - Zotero 10 allows several selected collection rows and its singular
 *   getters (getCollectionTreeRow) throw then; the plural getter
 *   getCollectionTreeRows() is preferred and the singular path is only a
 *   fallback for 7–9.
 * - Unloaded reader tabs ("reader-unloaded") have no Reader instance but still
 *   carry data.itemID in their tab info.
 */
import type {
  CollectionChain,
  ReaderItem,
  RowKind,
  SelectedRow,
  Snapshot,
  View,
} from "../core/types.js";

/* Minimal structural views of the Zotero objects we read. */
interface CollectionLike {
  key: string;
  name: string;
  libraryID: number;
  parentKey: string | false | null;
  deleted?: boolean;
}
interface ItemLike {
  key: string;
  libraryID: number;
  parentItem?: ItemLike | false | null;
  attachmentFilename?: string;
  isAttachment?: () => boolean;
  getField(field: string): unknown;
  getCollections(): number[];
}
interface TreeRowLike {
  type?: string;
  ref?: { libraryID?: number; name?: string } & Partial<CollectionLike>;
  isCollection?: () => boolean;
  isLibrary?: (includeGlobal?: boolean) => boolean;
  isSearch?: () => boolean;
  isDuplicates?: () => boolean;
  isUnfiled?: () => boolean;
  isTrash?: () => boolean;
  isPublications?: () => boolean;
  isFeed?: () => boolean;
  isFeedsOrFeed?: () => boolean;
}
interface PaneLike {
  getCollectionTreeRows?: () => TreeRowLike[];
  getCollectionTreeRow?: () => TreeRowLike | undefined;
  collectionsView?: { selectedTreeRow?: TreeRowLike } | false;
}
interface TabsLike {
  selectedID: string;
  selectedType: string;
  getTabInfo?: (id?: string) => { data?: { itemID?: number } } | undefined;
}
interface MainWindowLike {
  Zotero_Tabs?: TabsLike;
  ZoteroPane?: PaneLike;
}

const MAX_CHAIN_DEPTH = 64; // guards against a corrupt parent cycle

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function libraryName(libraryID: number): string {
  return safe(() => Zotero.Libraries.getName(libraryID), "") || `Library ${libraryID}`;
}

function collectionByKey(libraryID: number, key: string): CollectionLike | null {
  return safe(
    () =>
      (Zotero.Collections.getByLibraryAndKey(
        libraryID,
        key,
      ) as unknown as CollectionLike) || null,
    null,
  );
}

function collectionByID(id: number): CollectionLike | null {
  return safe(
    () => (Zotero.Collections.get(id) as unknown as CollectionLike) || null,
    null,
  );
}

/** Chain from the top-level collection down to `leaf`. */
function chainFor(leaf: CollectionLike): CollectionChain {
  const chain: CollectionChain = [];
  let current: CollectionLike | null = leaf;
  for (let i = 0; current && i < MAX_CHAIN_DEPTH; i++) {
    chain.unshift({ key: current.key, name: current.name });
    current = current.parentKey
      ? collectionByKey(current.libraryID, current.parentKey)
      : null;
  }
  return chain;
}

function rowKind(row: TreeRowLike): RowKind {
  const is = (fn?: () => boolean) => safe(() => (fn ? fn.call(row) : false), false);
  if (is(row.isCollection)) return "collection";
  if (is(row.isSearch)) return "search";
  if (is(row.isUnfiled)) return "unfiled";
  if (is(row.isDuplicates)) return "duplicates";
  if (is(row.isTrash)) return "trash";
  if (is(row.isPublications)) return "publications";
  if (is(row.isFeed) || is(row.isFeedsOrFeed)) return "feed";
  if (is(row.isLibrary)) return "library";
  return "other";
}

function toSelectedRow(row: TreeRowLike): SelectedRow | null {
  const kind = rowKind(row);
  const ref = row.ref;
  const libraryID = typeof ref?.libraryID === "number" ? ref.libraryID : null;
  if (kind === "collection" && ref && libraryID !== null && typeof ref.key === "string") {
    const collection = collectionByKey(libraryID, ref.key);
    if (!collection) return null;
    return { kind, libraryName: libraryName(libraryID), chain: chainFor(collection) };
  }
  if (kind === "feed" && typeof ref?.name === "string") {
    return { kind, libraryName: ref.name };
  }
  const name = libraryID !== null ? libraryName(libraryID) : "";
  if (kind === "search") return { kind, libraryName: name, searchName: ref?.name ?? "" };
  return { kind, libraryName: name };
}

function selectedRows(pane: PaneLike | undefined): SelectedRow[] {
  if (!pane) return [];
  const rows: TreeRowLike[] =
    typeof pane.getCollectionTreeRows === "function"
      ? safe(() => (pane.getCollectionTreeRows?.() ?? []).filter(Boolean), [])
      : safe(() => {
          const row =
            (pane.collectionsView && pane.collectionsView.selectedTreeRow) ||
            pane.getCollectionTreeRow?.();
          return row ? [row] : [];
        }, []);
  return rows.map(toSelectedRow).filter((r): r is SelectedRow => r !== null);
}

function readerItemID(tabs: TabsLike): number | null {
  const loaded = safe(
    () =>
      (Zotero.Reader.getByTabID(tabs.selectedID) as { itemID?: number } | undefined)
        ?.itemID,
    undefined,
  );
  if (typeof loaded === "number") return loaded;
  const fromInfo = safe(
    () => tabs.getTabInfo?.(tabs.selectedID)?.data?.itemID,
    undefined,
  );
  return typeof fromInfo === "number" ? fromInfo : null;
}

function readerItem(tabs: TabsLike): ReaderItem | null {
  const itemID = readerItemID(tabs);
  if (itemID === null) return null;
  const attachment = safe(() => Zotero.Items.get(itemID) as unknown as ItemLike, null);
  if (!attachment) return null;
  const parent = safe(() => attachment.parentItem || null, null);
  const source = parent ?? attachment;
  const collections = safe(() => source.getCollections(), [] as number[])
    .map(collectionByID)
    .filter((c): c is CollectionLike => c !== null && !c.deleted)
    .map(chainFor);
  const field = (item: ItemLike, name: string) =>
    safe(() => String(item.getField(name) ?? ""), "");
  return {
    libraryName: libraryName(attachment.libraryID),
    itemKey: source.key,
    itemTitle: field(source, "title"),
    attachmentKey: attachment.key,
    attachmentName:
      safe(() => attachment.attachmentFilename || "", "") || field(attachment, "title"),
    collections,
  };
}

function viewFor(selectedType: string): View {
  if (selectedType === "library") return "library";
  if (selectedType === "reader" || selectedType === "reader-unloaded") return "reader";
  return "other";
}

/** Read the current Zotero context, or null if there is no main window. */
export function readSnapshot(): Snapshot | null {
  const win = safe(
    () => Zotero.getMainWindow() as unknown as MainWindowLike | null,
    null,
  );
  if (!win) return null;
  const tabs = win.Zotero_Tabs;
  const view = viewFor(safe(() => tabs?.selectedType ?? "library", "library"));
  const rows = selectedRows(win.ZoteroPane);
  const reader = view === "reader" && tabs ? readerItem(tabs) : null;
  return { view, selectedRows: rows, reader };
}

/**
 * Subscribe to collection-tree selection changes in a main window, if the
 * tree exposes an onSelect binding. Returns an unsubscribe function. When the
 * binding has no removeListener, the returned function disarms the handler
 * instead, so a stale handler can never fire after shutdown.
 */
export function onCollectionSelect(win: unknown, handler: () => void): () => void {
  let armed = true;
  const wrapped = () => {
    if (armed) handler();
  };
  type Binding = {
    addListener?: (fn: () => void) => void;
    removeListener?: (fn: () => void) => void;
  };
  const binding = safe(
    () =>
      (
        (win as { ZoteroPane?: { collectionsView?: { onSelect?: Binding } | false } })
          ?.ZoteroPane?.collectionsView || undefined
      )?.onSelect,
    undefined,
  );
  if (!binding || typeof binding.addListener !== "function") return () => {};
  safe(() => binding.addListener?.(wrapped), undefined);
  return () => {
    armed = false;
    safe(() => binding.removeListener?.(wrapped), undefined);
  };
}
