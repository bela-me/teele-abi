import { createHash } from "node:crypto";
import { draftBasisPayload, reviewNeeded, type DraftBasis } from "../draft-basis-payload";

export type { DraftBasis };

/**
 * Fingerprint of the inputs a draft was generated from. Only this hash is
 * stored, not a second copy of the description.
 */
export function draftBasisHash(basis: DraftBasis): string {
  return createHash("sha256").update(draftBasisPayload(basis), "utf8").digest("hex");
}

/** Server-side review flag; see reviewNeeded for the rule. */
export function draftNeedsReview(draftReply: string, basisHash: string | null, current: DraftBasis): boolean {
  return reviewNeeded(draftReply, basisHash, draftBasisHash(current));
}
