/**
 * Photo → 3D: turn one product photo into a real 3D model for "View in 3D" and the try-on.
 *
 *   1. Background removal — plain studio backgrounds on the device; anything else with an
 *      in-browser AI model (@imgly/background-removal, downloaded once).
 *   2. Reading the piece — metal colour (yellow / white / rose) and stones (colour gems by hue,
 *      diamonds by sparkle), each stone with its position and size.
 *   3. Vectorising — marching-squares contour of the cut-out, simplified (Douglas–Peucker)
 *      and smoothed (Chaikin) into clean vector paths (SVG), holes included.
 *   4. 3D — flat-profile pieces (earrings, pendants, necklaces) become a watertight relief:
 *      the outline is filled, inflated with a rounded profile, embossed from the photo's
 *      shading and textured with the photo; detected stones are added as real faceted,
 *      refractive gems. Necklaces are bent round the neck. Rings and bangles — whose back a
 *      single photo can't show — are rebuilt as full 360° parametric models using the metal,
 *      stone and stone shape read from the photo.
 *   5. Export — binary glTF (.glb) in millimetres, in the same axes as the generated pieces,
 *      ready for the product's 3D model slot.
 *
 * Everything runs in the browser; the photo is only uploaded as part of the finished model.
 */
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { buildJewel, gemMaterial, stoneGeometry, type Jewel } from "./build";
import { METALS, isEarring, isNeck, isWrist, type GemKey, type JewelKind, type JewelSpec, type Metal, type Shape } from "./spec";

/* ───────────── canvas helpers ───────────── */

const cv = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const ctx = (c: HTMLCanvasElement) => c.getContext("2d", { willReadFrequently: true })!;

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    if (!url.startsWith("data:") && !url.startsWith("blob:")) img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("This image can't be read here (its host blocks it). Download it and upload the file instead."));
    img.src = url;
  });
}

function toWorking(img: HTMLImageElement | HTMLCanvasElement, max = 1100) {
  const iw = (img as HTMLImageElement).naturalWidth || img.width, ih = (img as HTMLImageElement).naturalHeight || img.height;
  const s = Math.min(1, max / Math.max(iw, ih));
  const c = cv(iw * s, ih * s);
  ctx(c).drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/* ───────────── 1. background removal ───────────── */

/** Plain-background removal: flood fill from the border within a colour tolerance. Returns alpha 0–1. */
function plainMask(src: HTMLCanvasElement, tol = 38): Float32Array | null {
  const w = src.width, h = src.height, px = ctx(src).getImageData(0, 0, w, h).data;
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  const ch = [0, 1, 2].map((k) => border.map((i) => px[i * 4 + k]).sort((a, b) => a - b)[border.length >> 1]);
  const dist0 = (i: number) => Math.hypot(px[i * 4] - ch[0], px[i * 4 + 1] - ch[1], px[i * 4 + 2] - ch[2]);
  // Soft floor shadows: the background colour, uniformly darkened, with no fine detail.
  const lum = (i: number) => px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2];
  const shadow = (i: number) => {
    const k = lum(i) / (ch[0] + ch[1] + ch[2] || 1);
    if (k < 0.4 || k > 0.94) return false; // shadows are darker than the floor; bright white stones are not
    if (Math.max(...[0, 1, 2].map((c) => Math.abs(px[i * 4 + c] - ch[c] * k))) > 9) return false;
    const x = i % w; const nb = [i - 1, i + 1, i - w, i + w, i - 2, i + 2, i - 2 * w, i + 2 * w];
    if (x < 2 || x > w - 3 || i < 2 * w || i >= (h - 2) * w) return true;
    return nb.every((j) => Math.abs(lum(j) - lum(i)) < 14);
  };
  const dist = (i: number) => (shadow(i) ? 0 : dist0(i));
  if (border.filter((i) => dist(i) < tol).length / border.length < 0.6) return null;
  const bg = new Uint8Array(w * h), stack: number[] = [];
  for (const i of border) if (!bg[i] && dist(i) < tol) { bg[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop()!, x = i % w, y = (i - x) / w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j >= 0 && !bg[j] && dist(j) < tol) { bg[j] = 1; stack.push(j); }
    }
  }
  const a = new Float32Array(w * h);
  let keep = 0;
  for (let i = 0; i < w * h; i++) {
    const d = dist(i);
    a[i] = bg[i] || d < tol * 0.5 ? 0 : d < tol * 1.6 ? Math.min(1, (d - tol * 0.5) / (tol * 1.1)) : 1;
    if (a[i] > 0.5) keep++;
  }
  // Enclosed background-coloured pockets: empty chain loops are flat → clear;
  // a white stone inside its setting has facets (contrast) → keep it.
  const pocket = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) pocket[i] = !bg[i] && a[i] < 0.5 ? 1 : 0;
  const { lab, comps } = components(pocket, w, h);
  const sum = comps.map(() => [0, 0, 0]);
  for (let i = 0; i < w * h; i++) if (lab[i] >= 0) { const l = lum(i) / 765; const s2 = sum[lab[i]]; s2[0]++; s2[1] += l; s2[2] += l * l; }
  const faceted = sum.map(([n, m, m2]) => n > 30 && Math.sqrt(Math.max(0, m2 / n - (m / n) ** 2)) > 0.035);
  for (let i = 0; i < w * h; i++) if (lab[i] >= 0 && faceted[lab[i]]) { a[i] = 1; keep++; }
  const cov = keep / (w * h);
  return cov < 0.004 || cov > 0.85 ? null : a;
}

const IMGLY_URL: string = "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/+esm";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let imgly: Promise<any> | null = null;
async function aiMask(src: HTMLCanvasElement, onProgress?: (m: string) => void): Promise<Float32Array> {
  onProgress?.("Loading the background-removal model (first time only, ~40 MB)…");
  imgly ??= import(/* @vite-ignore */ IMGLY_URL).catch((e) => { imgly = null; throw e; });
  const lib = await imgly;
  const blob: Blob = await new Promise((res) => src.toBlob((b) => res(b!), "image/png"));
  onProgress?.("Removing the background…");
  const out: Blob = await lib.removeBackground(blob, {
    progress: (key: string, cur: number, total: number) => { if (key.startsWith("fetch") && total) onProgress?.(`Downloading model… ${Math.round((cur / total) * 100)}%`); },
  });
  const img = await loadImage(URL.createObjectURL(out));
  const m = cv(src.width, src.height); ctx(m).drawImage(img, 0, 0, m.width, m.height);
  const d = ctx(m).getImageData(0, 0, m.width, m.height).data;
  const a = new Float32Array(m.width * m.height);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255;
  return a;
}

/* ───────────── colour maths ───────────── */

function hsv(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s: mx ? d / mx : 0, v: mx };
}
const isGoldHue = (h: number) => h >= 26 && h <= 62;
function gemFromHue(h: number, s: number, v: number): GemKey | null {
  if (h >= 345 || h < 12) return s < 0.55 && v > 0.75 ? "morganite" : "ruby";
  if (h >= 290) return "morganite";
  if (h >= 255) return "amethyst";
  if (h >= 185) return s < 0.5 && v > 0.65 ? "aquamarine" : "sapphire";
  if (h >= 75 && h < 175) return "emerald";
  if (h >= 12 && h < 26) return "citrine";
  return null;
}

/* ───────────── 2. analysis ───────────── */

export interface Stone { key: GemKey; x: number; y: number; r: number; aspect: number }
export interface PhotoAnalysis {
  /** trimmed cut-out of the piece (RGBA, transparent background) */
  cut: HTMLCanvasElement;
  /** alpha 0–1 of `cut` */
  alpha: Float32Array;
  w: number; h: number;
  metal: Metal; metalShare: Record<Metal, number>;
  stones: Stone[];
  /** the dominant stone type, if any */
  gem: GemKey | null;
  /** vector outline (cut-out pixel coordinates): outer contours and holes */
  paths: [number, number][][];
  /** a pair of earrings was found side by side — only the left one is used */
  pair: boolean;
}

interface Comp { area: number; x0: number; y0: number; x1: number; y1: number; cx: number; cy: number; label: number }
function components(bin: Uint8Array, w: number, h: number) {
  const lab = new Int32Array(w * h).fill(-1), out: Comp[] = [];
  const st: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!bin[i] || lab[i] >= 0) continue;
    const c: Comp = { area: 0, x0: w, y0: h, x1: 0, y1: 0, cx: 0, cy: 0, label: out.length };
    lab[i] = c.label; st.push(i);
    while (st.length) {
      const k = st.pop()!, x = k % w, y = (k - x) / w;
      c.area++; c.cx += x; c.cy += y;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (const j of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]) {
        if (j >= 0 && bin[j] && lab[j] < 0) { lab[j] = c.label; st.push(j); }
      }
    }
    c.cx /= c.area; c.cy /= c.area; out.push(c);
  }
  return { lab, comps: out };
}

/** Steps 1–3: background removal, metal & stones, vector outline. */
export async function analysePhoto(img: HTMLImageElement | HTMLCanvasElement, kind: JewelKind, onProgress?: (m: string) => void, forceAi = false): Promise<PhotoAnalysis> {
  const src = toWorking(img);
  onProgress?.("Removing the background…");
  let alpha = forceAi ? null : plainMask(src);
  if (!alpha) alpha = await aiMask(src, onProgress);
  const W = src.width, H = src.height;

  // keep the piece: the largest part plus anything sizeable (chains, the other earring)
  const bin = new Uint8Array(W * H); for (let i = 0; i < bin.length; i++) bin[i] = alpha[i] > 0.5 ? 1 : 0;
  const { lab, comps } = components(bin, W, H);
  if (!comps.length) throw new Error("Couldn't find the piece in this photo. Use a photo with the jewellery clearly in view.");
  comps.sort((a, b) => b.area - a.area);
  const big = comps[0].area;
  let keep = comps.filter((c) => c.area > big * 0.04);
  let pair = false;
  if (isEarring(kind) && keep.length >= 2 && keep[1].area > big * 0.45) {
    // a pair side by side: use the left earring (the try-on mirrors it for the right ear)
    const two = keep.slice(0, 2).sort((a, b) => a.cx - b.cx);
    if (two[0].x1 < two[1].x0 + (two[1].x1 - two[1].x0) * 0.3) { pair = true; keep = [two[0], ...keep.slice(2).filter((c) => c.cx < (two[0].x1 + two[1].x0) / 2)]; }
  }
  const keepSet = new Set(keep.map((c) => c.label));
  for (let i = 0; i < alpha.length; i++) if (alpha[i] > 0 && !keepSet.has(lab[i])) {
    // soft edge pixels belong to the nearest kept component — keep if a neighbour is kept
    if (lab[i] >= 0 || !(keepSet.has(lab[i - 1]) || keepSet.has(lab[i + 1]) || keepSet.has(lab[i - W]) || keepSet.has(lab[i + W]))) alpha[i] = 0;
  }

  // trim
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const c of keep) { x0 = Math.min(x0, c.x0); y0 = Math.min(y0, c.y0); x1 = Math.max(x1, c.x1); y1 = Math.max(y1, c.y1); }
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03) + 2;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const cut = cv(w, h), cx = ctx(cut);
  const sd = ctx(src).getImageData(x0, y0, w, h);
  const a2 = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = alpha[(y + y0) * W + x + x0]; a2[y * w + x] = v; sd.data[(y * w + x) * 4 + 3] = Math.round(v * 255); }
  cx.putImageData(sd, 0, 0);

  onProgress?.("Reading the metal and the stones…");
  const px = sd.data;
  const votes: Record<Metal, number> = { yellow: 0, white: 0, rose: 0 };
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
  // local contrast (sparkle) on a 5×5 window
  const sparkle = new Float32Array(w * h);
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    let m = 0, m2 = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const l = L[(y + dy) * w + x + dx]; m += l; m2 += l * l; }
    m /= 25; sparkle[y * w + x] = Math.sqrt(Math.max(0, m2 / 25 - m * m));
  }
  const gemMap = new Uint8Array(w * h); // 0 none, 1+ = gem index in GEM_KEYS
  const GEM_KEYS: GemKey[] = ["diamond", "ruby", "sapphire", "emerald", "morganite", "amethyst", "citrine", "aquamarine"];
  for (let i = 0; i < w * h; i++) {
    if (a2[i] < 0.75) continue;
    const { h: hu, s, v } = hsv(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    if (v < 0.16) continue;
    if (s > 0.42 && v > 0.2 && !isGoldHue(hu)) { const g = gemFromHue(hu, s, v); if (g) { gemMap[i] = GEM_KEYS.indexOf(g) + 1; continue; } }
    if (s < 0.2 && v > 0.55 && sparkle[i] > 0.11) { gemMap[i] = 1; continue; }
    if (v > 0.96 && s < 0.08) continue; // specular highlight
    if (s < 0.16) votes.white++;
    else if (isGoldHue(hu)) votes.yellow++;
    else if (hu < 26 || hu > 340) votes.rose++;
  }
  const tot = votes.yellow + votes.white + votes.rose || 1;
  const metalShare = { yellow: votes.yellow / tot, white: votes.white / tot, rose: votes.rose / tot };
  const metal = (Object.keys(metalShare) as Metal[]).sort((a, b) => metalShare[b] - metalShare[a])[0];

  // stones = blobs of the gem map (closed a little so a sparkly diamond reads as one stone)
  const closed = new Uint8Array(w * h);
  const rad = Math.max(1, Math.round(Math.max(w, h) / 220));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (a2[y * w + x] < 0.5) continue;
    let best = 0, n = 0;
    for (let dy = -rad; dy <= rad && !best; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const yy = y + dy, xx = x + dx; if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue;
      const g = gemMap[yy * w + xx]; if (g) { n++; if (n >= 3) { best = g; break; } }
    }
    closed[y * w + x] = best;
  }
  const stones: Stone[] = [];
  const { lab: gl, comps: gc } = components(closed, w, h);
  const minArea = Math.max(6, (w * h) * 0.0004);
  for (const c of gc) {
    if (c.area < minArea) continue;
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
    if (c.area < bw * bh * 0.35) continue; // stringy highlights aren't stones
    const count = new Array(GEM_KEYS.length + 1).fill(0);
    for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (gl[y * w + x] === c.label) count[closed[y * w + x]]++;
    const k = count.indexOf(Math.max(...count.slice(1)));
    stones.push({ key: GEM_KEYS[k - 1] ?? "diamond", x: c.cx, y: c.cy, r: Math.sqrt(c.area / Math.PI), aspect: bh / bw });
  }
  stones.sort((a, b) => b.r - a.r);
  stones.splice(40);
  const area: Partial<Record<GemKey, number>> = {};
  stones.forEach((s) => { area[s.key] = (area[s.key] ?? 0) + s.r * s.r; });
  const gem = (Object.keys(area) as GemKey[]).sort((a, b) => area[b]! - area[a]!)[0] ?? null;

  onProgress?.("Tracing the vector outline…");
  const paths = vectorise(a2, w, h);
  return { cut, alpha: a2, w, h, metal, metalShare, stones, gem, paths, pair };
}

/* ───────────── 3. vectorising ───────────── */

/** Marching squares on the alpha (iso 0.5) → closed loops, simplified and smoothed. */
export function vectorise(alpha: Float32Array, w: number, h: number): [number, number][][] {
  const A = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : alpha[y * w + x]);
  const segs = new Map<string, string>(); const pt = new Map<string, [number, number]>();
  const key = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
  const lerp = (a: number, b: number) => (0.5 - a) / (b - a || 1e-6);
  const add = (p: [number, number], q: [number, number]) => { const kp = key(...p), kq = key(...q); pt.set(kp, p); pt.set(kq, q); segs.set(kp, kq); };
  for (let y = -1; y < h; y++) for (let x = -1; x < w; x++) {
    const a = A(x, y), b = A(x + 1, y), c = A(x + 1, y + 1), d = A(x, y + 1);
    const idx = (a >= 0.5 ? 8 : 0) | (b >= 0.5 ? 4 : 0) | (c >= 0.5 ? 2 : 0) | (d >= 0.5 ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const T: [number, number] = [x + lerp(a, b), y], R: [number, number] = [x + 1, y + lerp(b, c)];
    const B: [number, number] = [x + lerp(d, c), y + 1], Lp: [number, number] = [x, y + lerp(a, d)];
    // segments oriented with the inside on the left
    switch (idx) {
      case 1: add(B, Lp); break; case 2: add(R, B); break; case 3: add(R, Lp); break;
      case 4: add(T, R); break; case 5: add(T, Lp); add(B, R); break; case 6: add(T, B); break;
      case 7: add(T, Lp); break; case 8: add(Lp, T); break; case 9: add(B, T); break;
      case 10: add(Lp, B); add(R, T); break; case 11: add(R, T); break; case 12: add(Lp, R); break;
      case 13: add(B, R); break; case 14: add(Lp, B); break;
    }
  }
  const loops: [number, number][][] = [];
  const used = new Set<string>();
  for (const start of segs.keys()) {
    if (used.has(start)) continue;
    const loop: [number, number][] = [];
    let k: string | undefined = start;
    while (k && !used.has(k)) { used.add(k); loop.push(pt.get(k)!); k = segs.get(k); }
    if (loop.length >= 8) loops.push(loop);
  }
  const minLen = Math.max(w, h) * 0.04;
  return loops
    .filter((l) => perimeter(l) > minLen)
    .map((l) => chaikin(simplify(l, Math.max(0.6, Math.max(w, h) / 700)), 2));
}
function perimeter(l: [number, number][]) { let s = 0; for (let i = 0; i < l.length; i++) { const a = l[i], b = l[(i + 1) % l.length]; s += Math.hypot(a[0] - b[0], a[1] - b[1]); } return s; }
function simplify(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st: [number, number][] = [[0, pts.length - 1]];
  while (st.length) {
    const [i, j] = st.pop()!; const [ax, ay] = pts[i], [bx, by] = pts[j];
    const L = Math.hypot(bx - ax, by - ay) || 1; let md = 0, mi = -1;
    for (let k = i + 1; k < j; k++) { const d = Math.abs((bx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (by - ay)) / L; if (d > md) { md = d; mi = k; } }
    if (md > eps && mi > 0) { keep[mi] = 1; st.push([i, mi], [mi, j]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function chaikin(p: [number, number][], n: number): [number, number][] {
  for (let it = 0; it < n; it++) {
    const o: [number, number][] = [];
    for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
    p = o;
  }
  return p;
}

/** The outline as an SVG document (mm units when `mmPerPx` is given). */
export function toSvg(a: PhotoAnalysis, mmPerPx = 1) {
  const d = a.paths.map((l) => "M" + l.map(([x, y]) => `${(x * mmPerPx).toFixed(2)} ${(y * mmPerPx).toFixed(2)}`).join("L") + "Z").join("");
  const W = (a.w * mmPerPx).toFixed(2), H = (a.h * mmPerPx).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm"><path d="${d}" fill="none" stroke="#a8874e" stroke-width="${(0.25 * Math.max(1, mmPerPx)).toFixed(2)}" fill-rule="evenodd"/></svg>`;
}
export const svgPath = (a: PhotoAnalysis) => a.paths.map((l) => "M" + l.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + "Z").join("");

/* ───────────── 4. 3D ───────────── */

export interface BuildOpts {
  kind: JewelKind;
  /** longest side of the piece in mm (earrings: one earring) */
  sizeMm: number;
  /** relief depth multiplier (1 = natural) */
  relief: number;
  metal: Metal;
  /** stone type for the 3D stones (null = keep detected types) */
  gem: GemKey | null;
  /** add real 3D stones where stones were found */
  stones3d: boolean;
  /** catalogue spec, used for rings & bangles */
  spec: JewelSpec;
}

/** Pieces a single front photo describes well (built as a relief). */
export const reliefKind = (k: JewelKind) => isEarring(k) || isNeck(k);
export const defaultSizeMm = (k: JewelKind) => (k === "stud" ? 10 : k === "hoop" ? 26 : k === "drop" ? 34 : k === "pendant" ? 30 : isNeck(k) ? 130 : isWrist(k) ? 64 : 20);

export function buildFromPhoto(a: PhotoAnalysis, o: BuildOpts): Jewel {
  if (!reliefKind(o.kind)) return parametricFromPhoto(a, o);
  return reliefFromPhoto(a, o);
}

/** Rings & bangles: full parametric 3D using what the photo shows. */
function parametricFromPhoto(a: PhotoAnalysis, o: BuildOpts): Jewel {
  const main = a.stones[0];
  const shape: Shape = main ? (main.aspect > 1.45 ? "pear" : main.aspect > 1.18 ? "oval" : main.aspect < 0.82 ? "emerald" : o.spec.shape) : o.spec.shape;
  const many = a.stones.length >= 6;
  // one glint is not a stone: need several, or a real centre stone
  const stoned = a.stones.length >= 2 || (main && main.r > Math.max(a.w, a.h) * 0.06);
  const gem = o.gem ?? (stoned ? a.gem ?? o.spec.gem ?? "diamond" : o.spec.gem);
  const spec: JewelSpec = {
    ...o.spec, kind: o.kind === "ring" || isWrist(o.kind) ? o.kind : o.spec.kind, metal: o.metal, gem: gem ?? null, shape,
    style: gem ? (o.kind === "ring" ? (many ? "halo-pave" : o.spec.style === "plain" ? "solitaire" : o.spec.style) : o.spec.style) : "plain",
  };
  if (isWrist(spec.kind) && gem && many) spec.kind = "tennis";
  return buildJewel(spec, { wearable: true });
}

const G = 200; // relief grid cells on the long side

function reliefFromPhoto(a: PhotoAnalysis, o: BuildOpts): Jewel {
  const { w, h } = a;
  const s = G / Math.max(w, h);
  const gw = Math.max(8, Math.round(w * s)), gh = Math.max(8, Math.round(h * s));
  const mm = o.sizeMm / Math.max(gw, gh); // mm per grid cell
  // resample alpha + luminance onto the grid
  const small = cv(gw, gh); const sx = ctx(small); sx.imageSmoothingQuality = "high"; sx.drawImage(a.cut, 0, 0, gw, gh);
  const sd = sx.getImageData(0, 0, gw, gh).data;
  const al = new Float32Array((gw + 1) * (gh + 1)), lum = new Float32Array((gw + 1) * (gh + 1));
  const at = (x: number, y: number) => y * (gw + 1) + x;
  for (let y = 0; y <= gh; y++) for (let x = 0; x <= gw; x++) {
    const xx = Math.min(gw - 1, x), yy = Math.min(gh - 1, y), i = (yy * gw + xx) * 4;
    al[at(x, y)] = x >= gw || y >= gh || x === 0 || y === 0 ? 0 : sd[i + 3] / 255;
    lum[at(x, y)] = (0.2126 * sd[i] + 0.7152 * sd[i + 1] + 0.0722 * sd[i + 2]) / 255;
  }
  // distance to the edge (chamfer 3-4, in cells)
  const INF = 1e9, dist = new Float32Array(al.length);
  for (let i = 0; i < al.length; i++) dist[i] = al[i] >= 0.5 ? INF : 0;
  for (let y = 1; y < gh; y++) for (let x = 1; x < gw; x++) { const i = at(x, y); if (!dist[i]) continue; dist[i] = Math.min(dist[i], dist[at(x - 1, y)] + 1, dist[at(x, y - 1)] + 1, dist[at(x - 1, y - 1)] + 1.414, dist[at(x + 1, y - 1)] + 1.414); }
  for (let y = gh - 1; y > 0; y--) for (let x = gw - 1; x > 0; x--) { const i = at(x, y); if (!dist[i]) continue; dist[i] = Math.min(dist[i], dist[at(x + 1, y)] + 1, dist[at(x, y + 1)] + 1, dist[at(x + 1, y + 1)] + 1.414, dist[at(x - 1, y + 1)] + 1.414); }
  // high-pass shading for the emboss
  const blur = new Float32Array(al.length);
  const r = 3;
  for (let y = 0; y <= gh; y++) for (let x = 0; x <= gw; x++) {
    let s2 = 0, n = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx > gw || yy > gh || al[at(xx, yy)] < 0.5) continue; s2 += lum[at(xx, yy)]; n++; }
    blur[at(x, y)] = n ? s2 / n : lum[at(x, y)];
  }
  const rim = Math.max(1.5, 1.6 / mm);                    // rounded edge: ~1.6 mm
  const reliefH = 1.1 * o.relief, backH = 0.35 * o.relief, t0 = 0.22, emboss = 0.45 * o.relief;
  const profile = (d: number) => { const u = Math.min(1, d / rim); return Math.sqrt(1 - (1 - u) * (1 - u)); };
  const frontZ = (x: number, y: number, d: number) => {
    const i = at(Math.round(x), Math.round(y));
    return t0 + reliefH * profile(d) + (d > 0.5 ? emboss * Math.min(1, d / rim) * (lum[i] - blur[i]) * 2.2 : 0);
  };
  const backZ = (d: number) => -(t0 + backH * profile(d));

  // marching-squares fill → shared vertices (corners + edge crossings)
  const verts: { x: number; y: number; d: number }[] = [];
  const vid = new Map<string, number>();
  const V = (k: string, x: number, y: number, d: number) => { let i = vid.get(k); if (i === undefined) { i = verts.length; verts.push({ x, y, d }); vid.set(k, i); } return i; };
  const tris: number[] = [];
  const rimEdges: [number, number][] = [];
  const iso = (p: number, q: number) => (0.5 - p) / (q - p || 1e-6);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const c = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
    const v = c.map(([cx2, cy2]) => al[at(cx2, cy2)]);
    const inside = v.map((q) => q >= 0.5);
    if (!inside.some(Boolean)) continue;
    const poly: number[] = []; const onEdge: boolean[] = [];
    for (let k = 0; k < 4; k++) {
      const n = (k + 1) % 4;
      if (inside[k]) { poly.push(V(`c${c[k][0]},${c[k][1]}`, c[k][0], c[k][1], dist[at(c[k][0], c[k][1])])); onEdge.push(false); }
      if (inside[k] !== inside[n]) {
        const t = iso(v[k], v[n]);
        const ex = c[k][0] + (c[n][0] - c[k][0]) * t, ey = c[k][1] + (c[n][1] - c[k][1]) * t;
        const a1 = c[k], a2 = c[n];
        const ek = a1[0] < a2[0] || (a1[0] === a2[0] && a1[1] < a2[1]) ? `e${a1}|${a2}` : `e${a2}|${a1}`;
        poly.push(V(ek, ex, ey, 0)); onEdge.push(true);
      }
    }
    for (let k = 1; k + 1 < poly.length; k++) tris.push(poly[0], poly[k], poly[k + 1]);
    for (let k = 0; k < poly.length; k++) { const n = (k + 1) % poly.length; if (onEdge[k] && onEdge[n]) rimEdges.push([poly[k], poly[n]]); }
  }
  if (!tris.length) throw new Error("The cut-out is empty.");

  // place: mm, centred on x, top at y = 0 (hook / neck), facing +Z
  const cx0 = gw / 2;
  const P = (x: number, y: number, z: number): [number, number, number] => {
    const X = (x - cx0) * mm, Y = -y * mm;
    if (isNeck(o.kind) && o.kind !== "pendant") {
      // bend round the neck so the sides go back like a real necklace
      const Rn = 54, th = X / Rn, rr = Rn + z;
      return [rr * Math.sin(th), Y, rr * Math.cos(th) - Rn];
    }
    return [X, Y, z];
  };
  const fpos: number[] = [], bpos: number[] = [], uv: number[] = [];
  for (const q of verts) {
    fpos.push(...P(q.x, q.y, frontZ(q.x, q.y, q.d)));
    bpos.push(...P(q.x, q.y, backZ(q.d)));
    uv.push(q.x / gw, 1 - q.y / gh);
  }
  // marching-squares fill winds clockwise in image space (y down) → counter-clockwise seen from +Z with y up
  const front = new THREE.BufferGeometry();
  front.setAttribute("position", new THREE.Float32BufferAttribute(fpos, 3));
  front.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  front.setIndex(tris); front.computeVertexNormals();
  const back = new THREE.BufferGeometry();
  back.setAttribute("position", new THREE.Float32BufferAttribute(bpos, 3));
  back.setIndex(tris.slice()); flipIndex(back);
  if (avgNz(front) < 0) { flipIndex(front); flipIndex(back); } // front must face +Z
  // rim wall between the two surfaces
  const wpos: number[] = [];
  for (const [i, j] of rimEdges) {
    const fi = fpos.slice(i * 3, i * 3 + 3), fj = fpos.slice(j * 3, j * 3 + 3), bi = bpos.slice(i * 3, i * 3 + 3), bj = bpos.slice(j * 3, j * 3 + 3);
    wpos.push(...fi, ...bi, ...fj, ...fj, ...bi, ...bj);
  }
  const wall = new THREE.BufferGeometry(); wall.setAttribute("position", new THREE.Float32BufferAttribute(wpos, 3)); wall.computeVertexNormals();

  // materials: the photo on the front (metal where the photo shows metal), plain metal behind
  const { map, mr } = photoTextures(a, o.metal);
  const photoMat = new THREE.MeshStandardMaterial({ map, metalnessMap: mr, roughnessMap: mr, metalness: 1, roughness: 1, side: THREE.DoubleSide });
  photoMat.name = "photo"; // kept as-is by the loader (custom.ts)
  const metal = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(METALS[o.metal].color), metalness: 1, roughness: 0.18, clearcoat: 0.3, envMapIntensity: 1.3, side: THREE.DoubleSide });
  metal.name = "metal";
  const group = new THREE.Group();
  const fm = new THREE.Mesh(front, photoMat); fm.name = "photo-relief";
  const bm = new THREE.Mesh(back, metal); bm.name = "back";
  const wm = new THREE.Mesh(wall, metal); wm.name = "rim";
  group.add(fm, bm, wm);

  // real stones on top of the relief
  const accents: THREE.Mesh[] = []; let centre: THREE.Mesh | null = null;
  if (o.stones3d) {
    const k = gw / a.w;
    for (const st of a.stones) {
      const gx = st.x * k, gy = st.y * k, d = dist[at(Math.min(gw, Math.round(gx)), Math.min(gh, Math.round(gy)))];
      const width = st.r * 2 * k * mm * 0.92;
      if (width < 0.7 || d < 0.5) continue;
      const key = o.gem ?? st.key;
      const shape: Shape = st.aspect > 1.45 ? "pear" : st.aspect > 1.18 ? "oval" : "round";
      const mat = gemMaterial(key === "pearl" ? "diamond" : key, width < 3.2); mat.name = `gem:${key}`;
      const m = new THREE.Mesh(stoneGeometry(width, shape, width > 3 ? 16 : 10), mat);
      const z = frontZ(gx, gy, d) - width * 0.08;
      const [X, Y, Z] = P(gx, gy, z);
      m.position.set(X, Y, Z);
      m.rotation.order = "YXZ";
      m.rotation.x = Math.PI / 2; // table towards the viewer
      if (isNeck(o.kind) && o.kind !== "pendant") m.rotation.y = Math.atan2(X, Z + 54);
      m.name = `stone-${key}`;
      group.add(m);
      if (!centre && width > 3.2) centre = m; else accents.push(m);
    }
  }
  return { group, metal, centre, accents, innerR: 0 };
}

function avgNz(g: THREE.BufferGeometry) { const n = g.attributes.normal; if (!n) return 1; let s = 0; for (let i = 0; i < n.count; i++) s += n.getZ(i); return s; }
function flipIndex(g: THREE.BufferGeometry) { const ix = g.index!; for (let i = 0; i < ix.count; i += 3) { const b = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, b); } ix.needsUpdate = true; g.computeVertexNormals(); }

/** Colour texture (edges filled with the metal colour) + metal/roughness texture (G = roughness, B = metalness). */
function photoTextures(a: PhotoAnalysis, metal: Metal) {
  const s = Math.min(1, 1024 / Math.max(a.w, a.h));
  const c = cv(a.w * s, a.h * s), x = ctx(c);
  x.fillStyle = METALS[metal].color; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(a.cut, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height);
  const m = cv(c.width, c.height), mx = ctx(m), md = mx.createImageData(c.width, c.height);
  for (let i = 0; i < c.width * c.height; i++) {
    const { h: hu, s: sat, v } = hsv(d.data[i * 4], d.data[i * 4 + 1], d.data[i * 4 + 2]);
    const gemLike = sat > 0.42 && !isGoldHue(hu);
    const metalness = gemLike ? 0.05 : v < 0.12 ? 0.6 : 0.92;
    const rough = gemLike ? 0.08 : 0.16 + (1 - v) * 0.22;
    md.data[i * 4] = 255; md.data[i * 4 + 1] = Math.round(rough * 255); md.data[i * 4 + 2] = Math.round(metalness * 255); md.data[i * 4 + 3] = 255;
  }
  mx.putImageData(md, 0, 0);
  // default flipY + v = 1 − y/h; GLTFExporter bakes the flip so the .glb is standard glTF
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const mr = new THREE.CanvasTexture(m);
  return { map, mr };
}

/* ───────────── 5. export ───────────── */

export async function exportGlb(j: Jewel): Promise<ArrayBuffer> {
  const scene = new THREE.Scene();
  // same format as the CRM Photo → 3D: already in mm with the hook / neck point at the origin, one piece
  scene.userData = { anchored: true, single: true, generator: "Aurelia Photo-to-3D (boutique)" };
  const g = j.group.clone(); g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1);
  scene.add(g);
  const out = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
  return out as ArrayBuffer;
}

/** Longest side of the built model in mm (used as the model's size on upload). */
export function modelSizeMm(j: Jewel) {
  const s = new THREE.Box3().setFromObject(j.group).getSize(new THREE.Vector3());
  return Math.max(s.x, s.y, s.z);
}
