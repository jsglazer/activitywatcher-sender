import { describe, expect, it } from "vitest";
import { buildHeartbeatData } from "../src/core/context.js";
import type { Snapshot } from "../src/core/types.js";
import {
  DATA_CHAIN,
  POL_CHAIN,
  RD_CHAIN,
  collectionRow,
  librarySnap,
  reader,
} from "./fixtures.js";

const KEYS = [
  "view",
  "library",
  "collection",
  "collection_key",
  "row",
  "item_key",
  "item_title",
  "attachment_key",
  "attachment_name",
  "ambiguous",
];
const titles = { sendTitles: true };

describe("library view", () => {
  it("collection row: full path, key, no item fields", () => {
    const d = buildHeartbeatData(librarySnap([collectionRow(RD_CHAIN)]), titles);
    expect(Object.keys(d)).toEqual(KEYS);
    expect(d).toEqual({
      view: "library",
      library: "My Library",
      collection: "My Library/Classes/2026-B/RD - POGO 801",
      collection_key: "C3",
      row: "collection",
      item_key: "",
      item_title: "",
      attachment_key: "",
      attachment_name: "",
      ambiguous: 0,
    });
  });

  it("library root and special rows report the library name and the row type", () => {
    for (const kind of [
      "library",
      "unfiled",
      "duplicates",
      "trash",
      "publications",
    ] as const) {
      const d = buildHeartbeatData(
        librarySnap([{ kind, libraryName: "My Library" }]),
        titles,
      );
      expect(d.collection).toBe("My Library");
      expect(d.row).toBe(kind);
      expect(d.collection_key).toBe("");
    }
    const s = buildHeartbeatData(
      librarySnap([{ kind: "search", libraryName: "My Library", searchName: "To read" }]),
      titles,
    );
    expect(s.row).toBe("search:To read");
    const f = buildHeartbeatData(
      librarySnap([{ kind: "feed", libraryName: "arXiv" }]),
      titles,
    );
    expect([f.library, f.collection, f.row]).toEqual(["arXiv", "arXiv", "feed"]);
  });

  it("multi-row selection: deepest common ancestor, row multiple", () => {
    const d = buildHeartbeatData(
      librarySnap([collectionRow(POL_CHAIN), collectionRow(DATA_CHAIN)]),
      titles,
    );
    expect(d.collection).toBe("My Library/Classes/2026-B");
    expect(d.collection_key).toBe("C2");
    expect(d.row).toBe("multiple");
  });

  it("multi-row selection with nothing in common: the library name", () => {
    const d = buildHeartbeatData(
      librarySnap([
        collectionRow(RD_CHAIN),
        { kind: "trash", libraryName: "My Library" },
      ]),
      titles,
    );
    expect([d.collection, d.collection_key, d.row]).toEqual([
      "My Library",
      "",
      "multiple",
    ]);
  });

  it("no selection: empty fields, same key set", () => {
    const d = buildHeartbeatData(librarySnap([]), titles);
    expect(Object.keys(d)).toEqual(KEYS);
    expect(d.collection).toBe("");
  });
});

describe("reader view", () => {
  const snap = (
    r: ReturnType<typeof reader>,
    rows = [collectionRow(RD_CHAIN)],
  ): Snapshot => ({
    view: "reader",
    selectedRows: rows,
    reader: r,
  });

  it("credits the deepest collection and sends item fields with titles", () => {
    const d = buildHeartbeatData(snap(reader([RD_CHAIN, POL_CHAIN])), titles);
    expect(Object.keys(d)).toEqual(KEYS);
    expect(d).toMatchObject({
      view: "reader",
      collection: "My Library/Classes/2026-B/RD - POGO 801/Polarization",
      collection_key: "C4",
      row: "collection",
      item_key: "ITEM1",
      item_title: "Research Replication",
      attachment_key: "ATT1",
      attachment_name: "Alvarez-ResearchReplication-2018.pdf",
      ambiguous: 0,
    });
  });

  it("without titles: title and file name are empty strings, keys unchanged", () => {
    const d = buildHeartbeatData(snap(reader([RD_CHAIN])), { sendTitles: false });
    expect(Object.keys(d)).toEqual(KEYS);
    expect([d.item_title, d.attachment_name]).toEqual(["", ""]);
    expect(d.item_key).toBe("ITEM1");
  });

  it("equal-depth tie uses the library-pane selection, and reports ambiguous", () => {
    const d = buildHeartbeatData(snap(reader([DATA_CHAIN, RD_CHAIN])), titles);
    expect(d.collection).toBe("My Library/Classes/2026-B/RD - POGO 801");
    expect(d.ambiguous).toBe(2);
  });

  it("unfiled item: library name, row unfiled", () => {
    const d = buildHeartbeatData(snap(reader([])), titles);
    expect([d.collection, d.row, d.collection_key]).toEqual([
      "My Library",
      "unfiled",
      "",
    ]);
  });

  it("reader tab whose item could not be read falls back to other + pane context", () => {
    const d = buildHeartbeatData(
      { view: "reader", selectedRows: [collectionRow(RD_CHAIN)], reader: null },
      titles,
    );
    expect([d.view, d.collection, d.item_key]).toEqual([
      "other",
      "My Library/Classes/2026-B/RD - POGO 801",
      "",
    ]);
  });
});

describe("determinism", () => {
  it("identical snapshots serialise byte-identically", () => {
    const snaps: Snapshot[] = [
      librarySnap([collectionRow(RD_CHAIN)]),
      {
        view: "reader",
        selectedRows: [collectionRow(RD_CHAIN)],
        reader: reader([DATA_CHAIN, RD_CHAIN]),
      },
      { view: "other", selectedRows: [], reader: null },
    ];
    for (const s of snaps) {
      const a = JSON.stringify(buildHeartbeatData(s, titles));
      const b = JSON.stringify(buildHeartbeatData(structuredClone(s), titles));
      expect(a).toBe(b);
    }
  });
});
