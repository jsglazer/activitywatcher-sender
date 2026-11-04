import type {
  CollectionChain,
  ReaderItem,
  SelectedRow,
  Snapshot,
} from "../src/core/types.js";

export const c = (key: string, name: string) => ({ key, name });

export const CLASSES = c("C1", "Classes");
export const TERM = c("C2", "2026-B");
export const RD = c("C3", "RD - POGO 801");
export const POL = c("C4", "Polarization");
export const USED = c("C5", "Used");
export const DATA = c("C6", "Data - POGO 511");
export const MATH = c("C7", "Math");

export const RD_CHAIN: CollectionChain = [CLASSES, TERM, RD];
export const POL_CHAIN: CollectionChain = [CLASSES, TERM, RD, POL];
export const USED_CHAIN: CollectionChain = [CLASSES, TERM, RD, POL, USED];
export const DATA_CHAIN: CollectionChain = [CLASSES, TERM, DATA];

export const collectionRow = (
  chain: CollectionChain,
  libraryName = "My Library",
): SelectedRow => ({
  kind: "collection",
  libraryName,
  chain,
});

export function reader(
  collections: CollectionChain[],
  extra: Partial<ReaderItem> = {},
): ReaderItem {
  return {
    libraryName: "My Library",
    itemKey: "ITEM1",
    itemTitle: "Research Replication",
    attachmentKey: "ATT1",
    attachmentName: "Alvarez-ResearchReplication-2018.pdf",
    collections,
    ...extra,
  };
}

export const librarySnap = (rows: SelectedRow[]): Snapshot => ({
  view: "library",
  selectedRows: rows,
  reader: null,
});
