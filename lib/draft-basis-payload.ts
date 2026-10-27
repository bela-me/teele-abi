import type { Tone } from "./draft";

// Shared by the server (node:crypto) and the browser (Web Crypto) so both
// compute exactly the same draftBasisHash. Keep this module dependency-free.

export type DraftBasis = {
  requesterName: string;
  category: string;
  description: string;
  tone: Tone;
};

const collapse = (value: string) => value.trim().replace(/\s+/g, " ");

/**
 * Canonical text that is hashed. Whitespace-only differences are ignored so
 * that re-saving unchanged values never flags the draft.
 */
export function draftBasisPayload(basis: DraftBasis): string {
  return JSON.stringify([collapse(basis.requesterName), basis.category.trim(), collapse(basis.description), basis.tone]);
}

/**
 * A draft needs review when it was generated (has a basis hash) and the hash
 * of the current name, category, description and tone differs from it.
 * Manually written drafts (no basis) and empty drafts are never flagged.
 */
export function reviewNeeded(draftReply: string, basisHash: string | null, currentHash: string): boolean {
  if (draftReply.trim() === "" || basisHash === null) return false;
  return basisHash !== currentHash;
}
