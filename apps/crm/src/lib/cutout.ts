/**
 * Try-on cut-out tools (run in the staff browser — nothing leaves the device until Save).
 *
 *  • autoMask   — removes a plain studio background by flood-filling from the border
 *  • aiMask     — general AI background removal (@imgly/background-removal, loaded on demand)
 *  • exportCut  — trims to the piece, scales and returns a transparent PNG + anchor maths
 */

export type TryOnType = "necklace" | "pendant" | "earrings" | "ring" | "bracelet";

/** Typical real sizes (mm) and the point of the piece that sits on the body. */
export const TYPE_DEFAULTS: Record<TryOnType, { mm: number; anchor: { x: number; y: number }; mmLabel: string; anchorHint: string }> = {
  earrings: { mm: 16, anchor: { x: 0.5, y: 0.04 }, mmLabel: "Width of one earring (mm)", anchorHint: "Click the hook / post of the left earring — where it meets the earlobe." },
  necklace: { mm: 150, anchor: { x: 0.5, y: 0.06 }, mmLabel: "Width across the necklace (mm)", anchorHint: "Click the top-centre of the necklace — the point that rests at the base of the neck." },
  pendant: { mm: 40, anchor: { x: 0.5, y: 0.06 }, mmLabel: "Width of the pendant with chain (mm)", anchorHint: "Click where the chain sits at the base of the neck (top-centre)." },
  ring: { mm: 20, anchor: { x: 0.5, y: 0.55 }, mmLabel: "Outer width of the ring (mm)", anchorHint: "Click the centre of the band — where the finger goes through." },
  bracelet: { mm: 65, anchor: { x: 0.5, y: 0.5 }, mmLabel: "Width across the bracelet (mm)", anchorHint: "Click the centre of the bracelet — where the wrist sits." },
};

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    if (!url.startsWith("data:") && !url.startsWith("blob:")) img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("This image can't be edited here (the host blocks it). Download it and upload the file instead."));
    img.src = url;
  });
}

export function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
const ctx2d = (c: HTMLCanvasElement) => c.getContext("2d", { willReadFrequently: true })!;

/** Copy an image into a working canvas, at most `max` px on the long side. */
export function toWorking(img: CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width: number; height: number }, max = 1100) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const s = Math.min(1, max / Math.max(iw, ih));
  const c = canvas(iw * s, ih * s);
  ctx2d(c).drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** A fully-opaque mask the size of `c` (white = keep). */
export function fullMask(c: HTMLCanvasElement) {
  const m = canvas(c.width, c.height);
  const x = ctx2d(m); x.fillStyle = "#fff"; x.fillRect(0, 0, m.width, m.height);
  return m;
}

/** Rotate a canvas by 90° steps and/or flip it horizontally. */
export function transform(c: HTMLCanvasElement, quarterTurns: number, flip = false) {
  const q = ((quarterTurns % 4) + 4) % 4;
  const out = canvas(q % 2 ? c.height : c.width, q % 2 ? c.width : c.height);
  const x = ctx2d(out);
  x.translate(out.width / 2, out.height / 2);
  x.rotate((q * Math.PI) / 2);
  if (flip) x.scale(-1, 1);
  x.drawImage(c, -c.width / 2, -c.height / 2);
  return out;
}

/**
 * Plain-background removal. Samples the border colour, flood-fills everything connected
 * to the border within `tol`, also clears enclosed pockets of background (inside a chain
 * loop), and feathers the edge. Returns null if the background isn't plain enough.
 */
export function autoMask(src: HTMLCanvasElement, tol = 38): { mask: HTMLCanvasElement; coverage: number } | { error: string } {
  const w = src.width, h = src.height;
  const px = ctx2d(src).getImageData(0, 0, w, h).data;
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  // Median border colour is robust to a piece touching the edge.
  const ch = [0, 1, 2].map((k) => border.map((i) => px[i * 4 + k]).sort((a, b) => a - b)[Math.floor(border.length / 2)]);
  const near = border.filter((i) => Math.hypot(px[i * 4] - ch[0], px[i * 4 + 1] - ch[1], px[i * 4 + 2] - ch[2]) < tol).length / border.length;
  if (near < 0.6) return { error: "The background isn't plain — try AI remove, or the eraser." };

  const dist = (i: number) => Math.hypot(px[i * 4] - ch[0], px[i * 4 + 1] - ch[1], px[i * 4 + 2] - ch[2]);
  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  for (const i of border) if (!bg[i] && dist(i) < tol) { bg[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i - x) / w;
    if (x > 0 && !bg[i - 1] && dist(i - 1) < tol) { bg[i - 1] = 1; stack.push(i - 1); }
    if (x < w - 1 && !bg[i + 1] && dist(i + 1) < tol) { bg[i + 1] = 1; stack.push(i + 1); }
    if (y > 0 && !bg[i - w] && dist(i - w) < tol) { bg[i - w] = 1; stack.push(i - w); }
    if (y < h - 1 && !bg[i + w] && dist(i + w) < tol) { bg[i + w] = 1; stack.push(i + w); }
  }
  const m = canvas(w, h);
  const mx = ctx2d(m);
  const id = mx.createImageData(w, h);
  let keep = 0;
  for (let i = 0; i < w * h; i++) {
    const d = dist(i);
    const a = bg[i] || d < tol * 0.5 ? 0 : d < tol * 1.6 ? Math.round(255 * Math.min(1, (d - tol * 0.5) / (tol * 1.1))) : 255;
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255;
    id.data[i * 4 + 3] = a;
    if (a > 128) keep++;
  }
  mx.putImageData(id, 0, 0);
  const coverage = keep / (w * h);
  if (coverage < 0.004) return { error: "Nothing was left after removing the background — lower the tolerance." };
  if (coverage > 0.85) return { error: "Hardly anything was removed — the background may not be plain." };
  return { mask: m, coverage };
}

/** AI background removal (salient object). Large model, downloaded once on first use. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let imgly: Promise<any> | null = null;
export async function aiMask(src: HTMLCanvasElement, onProgress?: (msg: string) => void): Promise<HTMLCanvasElement> {
  onProgress?.("Loading the AI model (first time only, ~40 MB)…");
  imgly ??= import(/* @vite-ignore */ "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/+esm").catch((e) => { imgly = null; throw e; });
  const lib = await imgly;
  const blob: Blob = await new Promise((res) => src.toBlob((b) => res(b!), "image/png"));
  onProgress?.("Removing the background…");
  const out: Blob = await lib.removeBackground(blob, {
    progress: (key: string, cur: number, total: number) => { if (key.startsWith("fetch") && total) onProgress?.(`Downloading model… ${Math.round((cur / total) * 100)}%`); },
  });
  const img = await loadImage(URL.createObjectURL(out));
  const m = canvas(src.width, src.height);
  const mx = ctx2d(m);
  mx.drawImage(img, 0, 0, m.width, m.height);
  // keep only alpha, painted white
  mx.globalCompositeOperation = "source-in";
  mx.fillStyle = "#fff";
  mx.fillRect(0, 0, m.width, m.height);
  return m;
}

/** Image × mask → transparent canvas. */
export function applyMask(src: HTMLCanvasElement, mask: HTMLCanvasElement) {
  const out = canvas(src.width, src.height);
  const x = ctx2d(out);
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = "destination-in";
  x.drawImage(mask, 0, 0);
  return out;
}

/** Bounding box of visible pixels. */
export function alphaBox(c: HTMLCanvasElement, threshold = 24) {
  const { width: w, height: h } = c;
  const d = ctx2d(c).getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > threshold) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export interface CutResult {
  png: string; width: number; height: number;
  anchorX: number; anchorY: number; splitX: number | null;
}

/**
 * Trim to the piece, scale to ≤ maxSide, and express the anchor relative to the result
 * (for a pair: relative to the left earring's half).
 */
export function exportCut(src: HTMLCanvasElement, mask: HTMLCanvasElement, anchorPx: { x: number; y: number }, pair: boolean, splitPx: number | null, maxSide = 900): CutResult | { error: string } {
  const cut = applyMask(src, mask);
  const crop = (x0: number, x1: number) => {
    const part = canvas(x1 - x0, cut.height);
    part.getContext("2d")!.drawImage(cut, x0, 0, x1 - x0, cut.height, 0, 0, x1 - x0, cut.height);
    const b = alphaBox(part);
    if (!b) return null;
    const pad = Math.round(Math.max(b.w, b.h) * 0.02);
    const bx = Math.max(0, b.x - pad), by = Math.max(0, b.y - pad);
    return { x: x0 + bx, y: by, w: Math.min(part.width - bx, b.w + pad * 2), h: Math.min(part.height - by, b.h + pad * 2) };
  };

  if (pair && splitPx != null) {
    // Trim each earring on its own so "width in mm" means the earring, not the gap between them.
    const L = crop(0, Math.round(splitPx)), R = crop(Math.round(splitPx), cut.width);
    if (!L || !R) return { error: "Couldn't find both earrings — move the split line between them." };
    const h = Math.max(L.h, R.h), w = L.w + R.w;
    const s = Math.min(1, maxSide / Math.max(w, h));
    const out = canvas(w * s, h * s);
    const ox = out.getContext("2d")!;
    ox.imageSmoothingQuality = "high";
    ox.drawImage(cut, L.x, L.y, L.w, L.h, 0, 0, L.w * s, L.h * s);           // both hang from the top edge
    ox.drawImage(cut, R.x, R.y, R.w, R.h, L.w * s, 0, R.w * s, R.h * s);
    return {
      png: out.toDataURL("image/png"), width: out.width, height: out.height,
      anchorX: Math.min(1, Math.max(0, (anchorPx.x - L.x) / L.w)),
      anchorY: Math.min(1, Math.max(0, (anchorPx.y - L.y) / h)),
      splitX: Math.round(L.w * s) / out.width,
    };
  }

  const box = crop(0, cut.width);
  if (!box) return { error: "The cut-out is empty — restore some of the piece first." };
  const s = Math.min(1, maxSide / Math.max(box.w, box.h));
  const out = canvas(box.w * s, box.h * s);
  const ox = out.getContext("2d")!;
  ox.imageSmoothingQuality = "high";
  ox.drawImage(cut, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);
  return {
    png: out.toDataURL("image/png"), width: out.width, height: out.height,
    anchorX: Math.min(1, Math.max(0, (anchorPx.x - box.x) / box.w)),
    anchorY: Math.min(1, Math.max(0, (anchorPx.y - box.y) / box.h)),
    splitX: null,
  };
}
