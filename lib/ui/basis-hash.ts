/**
 * Browser-side SHA-256 of draftBasisPayload(), matching the server's
 * node:crypto hash. Returns null where Web Crypto is unavailable (insecure
 * origin); the server still computes draftNeedsReview on save.
 */
export async function sha256Hex(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
