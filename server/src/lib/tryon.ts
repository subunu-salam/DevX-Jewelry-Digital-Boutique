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
  /** Point of the cut-out that sits on the body (0–1 of its width/height; earrings: hook of one earring). */
  anchor?: { x: number; y: number } | null;
  /** Real width of the piece (one earring for pairs), so it can be shown at true size. */
  widthMm?: number | null;
  /** Cut-out shows a pair side by side, split at `splitX` (0–1). */
  pair?: boolean;
  splitX?: number | null;
}

/** Studio cut-outs carry their metadata as query parameters on the asset URL. */
export function parseAssetMeta(url: string | null): Pick<TryOnInfo, "anchor" | "widthMm" | "pair" | "splitX"> {
  if (!url) return {};
  const q = url.split("?")[1];
  if (!q) return {};
  const p = new URLSearchParams(q);
  const num = (k: string) => { const v = Number(p.get(k)); return p.has(k) && Number.isFinite(v) ? v : null; };
  const ax = num("ax"), ay = num("ay");
  return { anchor: ax != null && ay != null ? { x: ax, y: ay } : null, widthMm: num("mm"), pair: p.get("pair") === "1", splitX: num("sx") };
}

export function assetUrlFor(productId: string, meta: { v: number; ax: number; ay: number; mm?: number | null; pair?: boolean; sx?: number | null }) {
  const q = new URLSearchParams({ v: String(meta.v), ax: meta.ax.toFixed(4), ay: meta.ay.toFixed(4) });
  if (meta.mm) q.set("mm", String(Math.round(meta.mm * 10) / 10));
  if (meta.pair) { q.set("pair", "1"); if (meta.sx != null) q.set("sx", meta.sx.toFixed(4)); }
  return `/api/public/tryon-assets/${productId}?${q.toString()}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveTryOn(p: { media: { kind: string; url: string }[]; category?: { slug: string } | null }): TryOnInfo | null {
  const row = p.media.find((m) => m.kind.startsWith("tryon"));
  if (row) {
    const t = row.kind.split(":")[1];
    if (t === "off") return null;
    const type = (TRYON_TYPES as readonly string[]).includes(t) ? (t as TryOnType) : typeFromCategory(p.category?.slug);
    if (!type) return null;
    const assetUrl = row.url && row.url !== "auto" ? row.url : null;
    return { type, assetUrl, ...parseAssetMeta(assetUrl) };
  }
  const type = typeFromCategory(p.category?.slug);
  return type ? { type, assetUrl: null } : null;
}

/** Media rows that are real gallery images (exclude try-on settings rows). */
export const isGalleryMedia = (m: { kind: string }) => !m.kind.startsWith("tryon");
