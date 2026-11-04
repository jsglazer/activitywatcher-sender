import { describe, expect, it } from "vitest";
import {
  collectionPath,
  commonChain,
  escapeSegment,
  isAtOrBelow,
} from "../src/core/path.js";
import { DATA_CHAIN, POL_CHAIN, RD_CHAIN, c } from "./fixtures.js";

describe("collectionPath", () => {
  it("joins the library name and the chain with /", () => {
    expect(collectionPath("My Library", RD_CHAIN)).toBe(
      "My Library/Classes/2026-B/RD - POGO 801",
    );
  });

  it("returns just the library name for an empty chain", () => {
    expect(collectionPath("My Library", [])).toBe("My Library");
  });

  it("replaces a / inside a name with ∕ so segments stay unambiguous", () => {
    const path = collectionPath("My Library", [c("A", "Pre/Post"), c("B", "x")]);
    expect(path).toBe("My Library/Pre∕Post/x");
    expect(path.split("/")).toHaveLength(3);
  });

  it("escapes a group library name too", () => {
    expect(escapeSegment("Lab/Group")).toBe("Lab∕Group");
  });
});

describe("isAtOrBelow", () => {
  it("matches the path itself and descendants, not siblings sharing a prefix", () => {
    expect(isAtOrBelow("My Library/A", "My Library/A")).toBe(true);
    expect(isAtOrBelow("My Library/A/B", "My Library/A")).toBe(true);
    expect(isAtOrBelow("My Library/AB", "My Library/A")).toBe(false);
  });
});

describe("commonChain", () => {
  it("returns the shared prefix by key", () => {
    expect(commonChain([POL_CHAIN, DATA_CHAIN]).map((x) => x.name)).toEqual([
      "Classes",
      "2026-B",
    ]);
    expect(commonChain([RD_CHAIN, POL_CHAIN])).toEqual(RD_CHAIN);
  });

  it("returns [] when nothing is shared or there are no chains", () => {
    expect(commonChain([RD_CHAIN, [c("Z", "Other")]])).toEqual([]);
    expect(commonChain([])).toEqual([]);
  });
});
