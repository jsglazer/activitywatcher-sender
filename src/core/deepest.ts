/**
 * Which collection a reader item's time is credited to: the deepest one.
 *
 * Tie-break (deterministic, so attribution never flips between ticks):
 *   1. prefer collections equal to or below the collection selected in the
 *      library pane;
 *   2. then the lexicographically smallest path (plain code-unit order, not
 *      locale order, so the result never depends on the runtime's locale).
 */
import { collectionPath, isAtOrBelow } from "./path.js";
import type { CollectionChain } from "./types.js";

export interface DeepestChoice {
  chain: CollectionChain;
  path: string;
  /** Number of candidates at the winning depth when more than one, else 0. */
  ambiguous: number;
}

export function chooseDeepest(
  libraryName: string,
  candidates: CollectionChain[],
  selectedPath: string | null,
): DeepestChoice | null {
  const usable = candidates.filter((c) => c.length > 0);
  if (usable.length === 0) return null;

  const depth = Math.max(...usable.map((c) => c.length));
  const tied = usable
    .filter((c) => c.length === depth)
    .map((chain) => ({ chain, path: collectionPath(libraryName, chain) }));

  const preferred =
    selectedPath === null ? [] : tied.filter((t) => isAtOrBelow(t.path, selectedPath));
  const pool = preferred.length > 0 ? preferred : tied;
  const winner = pool.reduce((best, t) => (t.path < best.path ? t : best));

  return {
    chain: winner.chain,
    path: winner.path,
    ambiguous: tied.length > 1 ? tied.length : 0,
  };
}
