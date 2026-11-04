import { describe, expect, it } from "vitest";
import { chooseDeepest } from "../src/core/deepest.js";
import { DATA_CHAIN, MATH, POL_CHAIN, RD_CHAIN, USED_CHAIN, c } from "./fixtures.js";

const LIB = "My Library";

describe("chooseDeepest", () => {
  it("single collection: that collection", () => {
    const r = chooseDeepest(LIB, [RD_CHAIN], null);
    expect(r?.path).toBe("My Library/Classes/2026-B/RD - POGO 801");
    expect(r?.ambiguous).toBe(0);
  });

  it("nested: the deepest wins regardless of order", () => {
    expect(chooseDeepest(LIB, [RD_CHAIN, USED_CHAIN, POL_CHAIN], null)?.path).toBe(
      "My Library/Classes/2026-B/RD - POGO 801/Polarization/Used",
    );
    expect(chooseDeepest(LIB, [USED_CHAIN, RD_CHAIN], null)?.ambiguous).toBe(0);
  });

  it("equal depth in different branches: lexicographically smallest path, ambiguous = count", () => {
    const r = chooseDeepest(LIB, [RD_CHAIN, DATA_CHAIN], null);
    expect(r?.path).toBe("My Library/Classes/2026-B/Data - POGO 511");
    expect(r?.ambiguous).toBe(2);
    // order of candidates does not matter
    expect(chooseDeepest(LIB, [DATA_CHAIN, RD_CHAIN], null)?.path).toBe(r?.path);
  });

  it("equal depth: a candidate at or below the selected collection is preferred", () => {
    const r = chooseDeepest(
      LIB,
      [RD_CHAIN, DATA_CHAIN],
      "My Library/Classes/2026-B/RD - POGO 801",
    );
    expect(r?.path).toBe("My Library/Classes/2026-B/RD - POGO 801");
    expect(r?.ambiguous).toBe(2);
    const below = chooseDeepest(LIB, [RD_CHAIN, DATA_CHAIN], "My Library/Classes");
    expect(below?.path).toBe("My Library/Classes/2026-B/Data - POGO 511");
  });

  it("a selected collection does not beat a deeper one", () => {
    expect(
      chooseDeepest(
        LIB,
        [RD_CHAIN, [MATH, c("M2", "Calc"), c("M3", "Limits"), c("M4", "Eps")]],
        "My Library/Classes/2026-B/RD - POGO 801",
      )?.path,
    ).toBe("My Library/Math/Calc/Limits/Eps");
  });

  it("unfiled (no collections): null", () => {
    expect(chooseDeepest(LIB, [], null)).toBeNull();
    expect(chooseDeepest(LIB, [[]], null)).toBeNull();
  });
});
