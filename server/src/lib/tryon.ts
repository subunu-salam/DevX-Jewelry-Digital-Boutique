/**
 * Virtual try-on settings (PRD §AI: "Virtual Try-On — Phase 2").
 *
 * Stored without a schema change as a ProductMedia row whose `kind` encodes the setting:
 *   kind = "tryon:<type>"  url = transparent PNG cut-out, or "auto" (use the product photo)
 *   kind = "tryon:off"     try-on disabled for this product
 * With no row, try-on is enabled automatically when the category supports it.
 */
export const TRYON_TYPES = ["necklace", "pendant", "earrings", "ring", "bracelet"] as const;
export type TryOnType = (typeof TRYON_TYPES)[number];

const CATEGORY_MAP: Record<string, TryOnType> = {
  necklaces: "necklace", necklace: "necklace", chains: "necklace", chokers: "necklace",
  pendants: "pendant", pendant: "pendant",
  earrings: "earrings", earring: "earrings", studs: "earrings", hoops: "earrings",
  rings: "ring", ring: "ring",
  bracelets: "bracelet", bracelet: "bracelet", bangles: "bracelet", bangle: "bracelet",
};

export function typeFromCategory(slug?: string | null): TryOnType | null {
  if (!slug) return null;
  return CATEGORY_MAP[slug.toLowerCase()] ?? null;
}

export interface TryOnInfo {
  type: TryOnType;
  /** Transparent cut-out supplied by staff; null → derive from the product photo on the device. */
  assetUrl: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveTryOn(p: { media: { kind: string; url: string }[]; category?: { slug: string } | null }): TryOnInfo | null {
  const row = p.media.find((m) => m.kind.startsWith("tryon"));
  if (row) {
    const t = row.kind.split(":")[1];
    if (t === "off") return null;
    const type = (TRYON_TYPES as readonly string[]).includes(t) ? (t as TryOnType) : typeFromCategory(p.category?.slug);
    if (!type) return null;
    return { type, assetUrl: row.url && row.url !== "auto" ? row.url : null };
  }
  const type = typeFromCategory(p.category?.slug);
  return type ? { type, assetUrl: null } : null;
}

/** Media rows that are real gallery images (exclude try-on settings rows). */
export const isGalleryMedia = (m: { kind: string }) => !m.kind.startsWith("tryon");
