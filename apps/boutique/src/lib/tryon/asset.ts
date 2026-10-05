/**
 * Prepares the jewellery overlay image on the device:
 *  • staff-supplied transparent cut-out (best), or
 *  • an automatic cut-out of the product photo when it's shot on a plain background.
 * Lifestyle photos (piece worn on a model) can't be cut out reliably → returns null,
 * and the studio offers the AI render or a boutique visit instead.
 */
import type { TryOnType } from "./engine";
import { renderLikeness, type Fit } from "./render";

export interface Asset {
  src: string;           // image URL or data URL with transparency
  aspect: number;        // width / height
  halves?: [string, string]; // earrings shot as a pair → one per ear
  exportable: boolean;   // false when the source blocks canvas export (CORS)
  fit: Fit;              // how it sits on the body
  source: "staff" | "photo" | "likeness";
}

/** Fit for real cut-outs (staff PNGs / auto-cut product photos). */
const PHOTO_FIT: Record<TryOnType, Fit> = {
  necklace: { anchor: "top", k: 1.15, drop: 0.42 },
  pendant: { anchor: "center", k: 1 },
  earrings: { anchor: "top", k: 1.2 },
  ring: { anchor: "center", k: 1.15 },
  bracelet: { anchor: "center", k: 1.2 },
};

interface PieceLike {
  name: string; metalColor: string; stoneType?: string | null; tags?: string[];
  category?: { slug: string } | null; image: string | null;
  tryOn?: { type: TryOnType; assetUrl: string | null } | null;
}

/** Best available overlay: staff cut-out → auto cut-out of a plain-background photo → rendered likeness. */
export async function assetFor(p: PieceLike): Promise<Asset | null> {
  const t = p.tryOn;
  if (!t) return null;
  const fit = PHOTO_FIT[t.type];
  if (t.assetUrl) {
    const a = await prepareAsset(t.assetUrl, true, t.type === "earrings");
    if (a) return { ...a, fit, source: "staff" };
  }
  if (p.image) {
    const a = await prepareAsset(p.image, false, t.type === "earrings");
    if (a) return { ...a, fit, source: "photo" };
  }
  const r = renderLikeness(t.type, p);
  return { src: r.src, aspect: r.aspect, exportable: true, fit: r.fit, source: "likeness" };
}

function load(url: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("load failed"));
    img.src = url;
  });
}

function canvasOf(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

function split(img: CanvasImageSource, w: number, h: number): [string, string] {
  const half = Math.floor(w / 2);
  const make = (sx: number) => {
    const c = canvasOf(half, h);
    c.getContext("2d")!.drawImage(img, sx, 0, half, h, 0, 0, half, h);
    return c.toDataURL("image/png");
  };
  return [make(0), make(w - half)];
}

/** Flood-fill a uniform background from the border and make it transparent. */
function cutout(img: HTMLImageElement): { url: string; w: number; h: number } | null {
  const max = 720;
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s));
  const h = Math.max(1, Math.round(img.naturalHeight * s));
  const c = canvasOf(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const px = id.data;

  // Background colour from the border; give up if the border isn't uniform.
  let n = 0, r = 0, g = 0, b = 0;
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  for (const i of border) { r += px[i * 4]; g += px[i * 4 + 1]; b += px[i * 4 + 2]; n++; }
  r /= n; g /= n; b /= n;
  let varSum = 0;
  for (const i of border) varSum += (px[i * 4] - r) ** 2 + (px[i * 4 + 1] - g) ** 2 + (px[i * 4 + 2] - b) ** 2;
  const std = Math.sqrt(varSum / n / 3);
  if (std > 26) return null;

  const tol = 38;
  const dist = (i: number) => Math.sqrt((px[i * 4] - r) ** 2 + (px[i * 4 + 1] - g) ** 2 + (px[i * 4 + 2] - b) ** 2);
  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  for (const i of border) if (!bg[i] && dist(i) < tol) { bg[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i - x) / w;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const j of nb) if (j >= 0 && !bg[j] && dist(j) < tol) { bg[j] = 1; stack.push(j); }
  }

  let fg = 0, minX = w, minY = h, maxX = 0, maxY = 0;
  for (let i = 0; i < w * h; i++) {
    const dd = dist(i);
    // enclosed holes (e.g. inside a necklace loop) that match the background closely
    const isBg = bg[i] || dd < tol * 0.55;
    const a = isBg ? 0 : dd < tol * 1.5 ? Math.round(255 * Math.min(1, (dd - tol * 0.55) / (tol * 0.95))) : 255;
    px[i * 4 + 3] = a;
    if (a > 40) {
      fg++;
      const x = i % w, y = (i - x) / w;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const frac = fg / (w * h);
  if (frac < 0.015 || frac > 0.78) return null;
  ctx.putImageData(id, 0, 0);

  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.03);
  const cx = Math.max(0, minX - pad), cy = Math.max(0, minY - pad);
  const cw = Math.min(w - cx, maxX - minX + pad * 2), ch = Math.min(h - cy, maxY - minY + pad * 2);
  const out = canvasOf(cw, ch);
  out.getContext("2d")!.drawImage(c, cx, cy, cw, ch, 0, 0, cw, ch);
  return { url: out.toDataURL("image/png"), w: cw, h: ch };
}

type Prepared = Omit<Asset, "fit" | "source">;

export async function prepareAsset(url: string, fromStaff: boolean, splitPair: boolean): Promise<Prepared | null> {
  let img: HTMLImageElement;
  let cors = true;
  try { img = await load(url, true); } catch {
    try { img = await load(url, false); cors = false; } catch { return null; }
  }
  if (fromStaff) {
    const aspect = img.naturalWidth / img.naturalHeight;
    const halves = splitPair && cors && aspect > 1.3 ? split(img, img.naturalWidth, img.naturalHeight) : undefined;
    return { src: url, aspect: halves ? aspect / 2 : aspect, halves, exportable: cors };
  }
  if (!cors) return null;
  const cut = cutout(img);
  if (!cut) return null;
  const aspect = cut.w / cut.h;
  if (splitPair && aspect > 1.3) {
    const pair = await load(cut.url, false);
    return { src: cut.url, aspect: aspect / 2, halves: split(pair, cut.w, cut.h), exportable: true };
  }
  return { src: cut.url, aspect, exportable: true };
}

/** Downscale a photo to a JPEG data URL (keeps uploads small and strips EXIF). */
export async function toJpeg(src: string, maxSide = 1280, mirror = false): Promise<{ url: string; w: number; h: number }> {
  const img = await load(src, false);
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
  const c = canvasOf(w, h);
  const ctx = c.getContext("2d")!;
  if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  ctx.drawImage(img, 0, 0, w, h);
  return { url: c.toDataURL("image/jpeg", 0.9), w, h };
}
