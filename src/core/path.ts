/**
 * Collection paths: "My Library/Classes/2026-B/RD - POGO 801".
 * A "/" inside a name becomes "∕" (U+2215) so the path always splits back
 * into the right segments.
 */
import type { CollectionChain } from "./types.js";

export const PATH_SEPARATOR = "/";
const SLASH_SUBSTITUTE = "∕";

export function escapeSegment(name: string): string {
  return name.split(PATH_SEPARATOR).join(SLASH_SUBSTITUTE);
}

/** Full path of a collection chain, starting with the library name. */
export function collectionPath(libraryName: string, chain: CollectionChain): string {
  return [libraryName, ...chain.map((c) => c.name)]
    .map(escapeSegment)
    .join(PATH_SEPARATOR);
}

/** True if `path` is `ancestor` itself or lies below it. */
export function isAtOrBelow(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(ancestor + PATH_SEPARATOR);
}

/**
 * Longest chain prefix shared by every chain (compared by collection key).
 * Returns [] when the chains share no top-level collection.
 */
export function commonChain(chains: CollectionChain[]): CollectionChain {
  if (chains.length === 0) return [];
  const [first, ...rest] = chains;
  const out: CollectionChain = [];
  for (let i = 0; i < first.length; i++) {
    const key = first[i].key;
    if (rest.every((c) => c[i]?.key === key)) out.push(first[i]);
    else break;
  }
  return out;
}
