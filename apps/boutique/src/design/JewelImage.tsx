import { useEffect, useState } from "react";
import { cn } from "@ui";
import { renderLikeness } from "@/lib/tryon/render";
import type { TryOnType } from "@/lib/tryon/engine";

/** Whatever we know about a piece — every field optional so any caller can pass what it has. */
export interface PieceInfo {
  name?: string;
  metalColor?: string;
  stoneType?: string | null;
  tags?: string[];
  category?: { slug: string } | null;
  tryOn?: { type: TryOnType } | null;
}

const FROM_CATEGORY: Record<string, TryOnType> = {
  rings: "ring", ring: "ring", necklaces: "necklace", necklace: "necklace", chokers: "necklace",
  earrings: "earrings", pendants: "pendant", pendant: "pendant", bracelets: "bracelet", bangles: "bracelet", bracelet: "bracelet",
};
function typeOf(p?: PieceInfo): TryOnType {
  if (p?.tryOn?.type) return p.tryOn.type;
  const c = p?.category?.slug && FROM_CATEGORY[p.category.slug];
  if (c) return c;
  const n = (p?.name ?? "").toLowerCase();
  if (/earring|hoop|stud|jhumka|drop/.test(n)) return "earrings";
  if (/necklace|choker|rivi|strand|chain/.test(n)) return "necklace";
  if (/pendant|locket/.test(n)) return "pendant";
  if (/bracelet|bangle|cuff|tennis/.test(n)) return "bracelet";
  return "ring";
}

const cache = new Map<string, string>();

/**
 * A full-bleed image (data URL) showing a rendered likeness of the piece on a soft peach field.
 * Used wherever a product photo is missing or fails to load, so a broken image is never shown.
 */
export function fallbackImage(piece?: PieceInfo): string {
  const key = JSON.stringify([piece?.name, piece?.metalColor, piece?.stoneType, piece?.category?.slug, piece?.tryOn?.type]);
  const hit = cache.get(key);
  if (hit) return hit;
  const type = typeOf(piece);
  const r = renderLikeness(type, { name: piece?.name ?? "", metalColor: piece?.metalColor ?? "Yellow", stoneType: piece?.stoneType, tags: piece?.tags, category: piece?.category });
  const W = 800, H = 1000;
  const w = Math.min(W * 0.66, H * 0.62 * r.aspect), h = w / r.aspect;
  const x = (W - w) / 2, y = (H - h) / 2 - H * 0.02;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><radialGradient id="bg" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="#FDF5EF"/><stop offset=".6" stop-color="#F3DDCF"/><stop offset="1" stop-color="#E7C4AE"/></radialGradient>
<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".7"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<ellipse cx="${W / 2}" cy="${y + h / 2}" rx="${w * 0.62}" ry="${h * 0.7 + 60}" fill="url(#glow)"/>
<image href="${r.src}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"/>
</svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(key, url);
  return url;
}

/**
 * Product photo that never shows a broken image: if the photo is missing or fails to load,
 * it swaps to {@link fallbackImage} for that piece.
 */
export function JewelImage({
  src, piece, alt, className, loading = "lazy", decoding = "async",
}: { src?: string | null; piece?: PieceInfo; alt?: string; className?: string; loading?: "lazy" | "eager"; decoding?: "async" | "sync" | "auto" }) {
  const [failed, setFailed] = useState(!src);
  useEffect(() => setFailed(!src), [src]);
  return (
    <img
      src={failed ? fallbackImage(piece) : (src as string)}
      alt={alt ?? piece?.name ?? ""}
      loading={loading}
      decoding={decoding}
      onError={() => setFailed(true)}
      draggable={false}
      className={cn("size-full object-cover", className)}
    />
  );
}
