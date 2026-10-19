/**
 * Photo → 3D, in the staff browser.
 *
 *  1. analyse()    — reads the cut-out: metal colour (yellow / white / rose) and gem colour.
 *  2. vectorize()  — traces the cut-out's outline into clean vector paths (marching squares →
 *                    Douglas-Peucker → Chaikin), with holes, as SVG and as geometry input.
 *  3. buildRelief() — flat-ish pieces (pendants, earrings, necklaces): the vector outline becomes a
 *                    solid, domed 3D piece in true millimetres. The photo is mapped onto the front
 *                    with a normal map from its own detail so it catches light as it turns; back
 *                    and sides are polished metal. Hook / neck point is placed at the origin so the
 *                    try-on hangs it correctly.
 *     buildParametric() — round pieces (rings, bangles): a true 3D CAD-style piece generated from
 *                    the detected metal, stone colour and the chosen style.
 *  4. exportGlb()  — a binary glTF the shop's "View in 3D" and 3D try-on load directly.
 */
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildJewel, metalMaterial, type Jewel } from "@jewel3d/build";
import { isEarring, isNeck, type GemKey, type JewelKind, type JewelSpec, type Metal, type Shape, type Style } from "@jewel3d/spec";

export type { GemKey, JewelKind, JewelSpec, Metal, Shape, Style };

/* ───────────── 1. Analysis ───────────── */

export interface Analysis { metal: Metal; gem: GemKey | null; metalCss: string; gemCss: string | null; sparkle: number }

function hsv(r: number, g: number, b: number) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx };
}

/** Read metal and stone colours from the photo, inside the mask. */
export function analyse(img: HTMLCanvasElement, mask: HTMLCanvasElement): Analysis {
  const w = img.width, h = img.height;
  const px = img.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const mk = mask.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 90000)));
  let yellow = 0, white = 0, rose = 0, n = 0, bright = 0;
  const metalSum = { yellow: [0, 0, 0], white: [0, 0, 0], rose: [0, 0, 0] } as Record<Metal, number[]>;
  const gemBins: Record<string, { n: number; rgb: number[] }> = {};
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const i = (y * w + x) * 4;
    if (mk[i] < 128) continue;
    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    const c = hsv(r, g, b);
    n++;
    if (c.v > 0.93 && c.s < 0.1) bright++;
    const add = (m: Metal) => { metalSum[m][0] += r; metalSum[m][1] += g; metalSum[m][2] += b; };
    if (c.v < 0.2) continue;
    if (c.s < 0.13) { white++; add("white"); continue; }
    if (c.h >= 32 && c.h <= 62 && c.s < 0.8) { yellow++; add("yellow"); continue; }
    if ((c.h < 32 || c.h > 345) && c.s < 0.45 && c.v > 0.45) { rose++; add("rose"); continue; }
    if (c.s > 0.42 && c.v > 0.25) {
      const key: GemKey | null =
        c.h >= 345 || c.h < 14 ? "ruby" : c.h >= 290 ? "morganite" : c.h >= 250 ? "amethyst" : c.h >= 195 ? "sapphire"
          : c.h >= 165 ? "aquamarine" : c.h >= 75 ? "emerald" : c.h < 32 && c.s > 0.6 ? "citrine" : null;
      if (key) { const bin = (gemBins[key] ??= { n: 0, rgb: [0, 0, 0] }); bin.n++; bin.rgb[0] += r; bin.rgb[1] += g; bin.rgb[2] += b; }
    }
  }
  n = Math.max(1, n);
  // white metal only wins when there's little warm metal — diamonds also read as "white"
  const metal: Metal = yellow > n * 0.12 && yellow >= rose ? "yellow" : rose > n * 0.12 ? "rose" : white > yellow + rose ? "white" : yellow >= rose ? "yellow" : "rose";
  const best = Object.entries(gemBins).sort((a, b) => b[1].n - a[1].n)[0];
  const sparkle = bright / n;
  let gem: GemKey | null = best && best[1].n > n * 0.03 ? (best[0] as GemKey) : null;
  if (!gem && sparkle > (metal === "white" ? 0.09 : 0.035)) gem = "diamond";
  const css = (v: number[], k: number) => `rgb(${Math.round((v[0] / k) * 255)},${Math.round((v[1] / k) * 255)},${Math.round((v[2] / k) * 255)})`;
  const mc = metal === "yellow" ? yellow : metal === "rose" ? rose : white;
  return {
    metal, gem, sparkle,
    metalCss: mc ? css(metalSum[metal], mc) : "#d9b46a",
    gemCss: gem && best && gem === best[0] ? css(best[1].rgb, best[1].n) : gem === "diamond" ? "#f4f8ff" : null,
  };
}

/* ───────────── 2. Vectorisation ───────────── */

export type Pt = [number, number];
export interface Loop { pts: Pt[]; area: number }
export interface Region { outer: Loop; holes: Loop[] }
export interface Vectors { regions: Region[]; width: number; height: number; svg: string; points: number }

const signedArea = (p: Pt[]) => { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1]); return a / 2; };
function inside(pt: Pt, poly: Pt[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function rdp(p: Pt[], eps: number): Pt[] {
  if (p.length < 4) return p;
  const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1;
  const stack: [number, number][] = [[0, p.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [x1, y1] = p[a], [x2, y2] = p[b], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    let best = -1, bd = eps;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * p[i][0] - dx * p[i][1] + x2 * y1 - y2 * x1) / L; if (d > bd) { bd = d; best = i; } }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return p.filter((_, i) => keep[i]);
}
/** Closed-loop simplify: split at the farthest pair so both halves keep their corners. */
function simplifyLoop(p: Pt[], eps: number) {
  if (p.length < 8) return p;
  let far = 0, fd = 0;
  for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i][0] - p[0][0], p[i][1] - p[0][1]); if (d > fd) { fd = d; far = i; } }
  const a = rdp(p.slice(0, far + 1), eps), b = rdp([...p.slice(far), p[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
function chaikin(p: Pt[], iters = 2) {
  let q = p;
  for (let k = 0; k < iters; k++) {
    const o: Pt[] = [];
    for (let i = 0; i < q.length; i++) {
      const a = q[i], b = q[(i + 1) % q.length];
      o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q = o;
  }
  return q;
}

/** Binary grid from a mask canvas, downsampled to at most `maxSide`, with a 1-cell empty border. */
function grid(mask: HTMLCanvasElement, maxSide: number) {
  const s = Math.min(1, maxSide / Math.max(mask.width, mask.height));
  const gw = Math.max(2, Math.round(mask.width * s)), gh = Math.max(2, Math.round(mask.height * s));
  const c = document.createElement("canvas"); c.width = gw; c.height = gh;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(mask, 0, 0, gw, gh);
  const d = x.getImageData(0, 0, gw, gh).data;
  const W = gw + 2, H = gh + 2, g = new Uint8Array(W * H);
  for (let y = 0; y < gh; y++) for (let xx = 0; xx < gw; xx++) g[(y + 1) * W + xx + 1] = d[(y * gw + xx) * 4] >= 128 ? 1 : 0;
  return { g, W, H, k: 1 / s };
}

/** Trace the mask outline into vector loops (in the mask's pixel space). */
export function vectorize(mask: HTMLCanvasElement, maxSide = 480): Vectors {
  const { g, W, H, k } = grid(mask, maxSide);
  const at = (x: number, y: number) => g[y * W + x];
  // marching squares: edge-midpoint segments, linked into loops
  const pos = new Map<string, Pt>(), adj = new Map<string, string[]>();
  const pt = (key: string, p: Pt) => { pos.set(key, p); return key; };
  const link = (a: string, b: string) => { (adj.get(a) ?? adj.set(a, []).get(a)!).push(b); (adj.get(b) ?? adj.set(b, []).get(b)!).push(a); };
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const c = at(x, y) * 8 + at(x + 1, y) * 4 + at(x + 1, y + 1) * 2 + at(x, y + 1);
    if (c === 0 || c === 15) continue;
    const T = pt(`h${x},${y}`, [x + 0.5, y]), R = pt(`v${x + 1},${y}`, [x + 1, y + 0.5]);
    const B = pt(`h${x},${y + 1}`, [x + 0.5, y + 1]), L = pt(`v${x},${y}`, [x, y + 0.5]);
    switch (c) {
      case 1: case 14: link(L, B); break;
      case 2: case 13: link(B, R); break;
      case 3: case 12: link(L, R); break;
      case 4: case 11: link(T, R); break;
      case 6: case 9: link(T, B); break;
      case 7: case 8: link(T, L); break;
      case 5: link(L, B); link(T, R); break;
      case 10: link(T, L); link(B, R); break;
    }
  }
  const seen = new Set<string>(), loops: Loop[] = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const raw: Pt[] = [];
    let prev = "", cur = start;
    while (!seen.has(cur)) {
      seen.add(cur); raw.push(pos.get(cur)!);
      const nx = (adj.get(cur) ?? []).find((n) => n !== prev && !seen.has(n)) ?? (adj.get(cur) ?? []).find((n) => n !== prev);
      if (!nx) break;
      prev = cur; cur = nx;
    }
    if (raw.length < 8) continue;
    // grid → mask pixels, smooth the stair-steps, then keep only the points that matter
    const px = raw.map(([x, y]) => [(x - 1) * k, (y - 1) * k] as Pt);
    const pts = simplifyLoop(chaikin(simplifyLoop(px, 0.7 * k), 2), 0.3 * k);
    const area = signedArea(pts);
    if (Math.abs(area) < 16 * k * k) continue;
    loops.push({ pts, area });
  }
  // nesting: a loop inside an even number of others is an outline, odd is a hole
  loops.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  const total = loops.reduce((s, l) => s + (l.area > 0 ? 0 : 0) + Math.abs(l.area), 0) || 1;
  const kept = loops.filter((l) => Math.abs(l.area) > total * 0.0006);
  const depth = kept.map((l, i) => kept.slice(0, i).filter((o) => inside(l.pts[0], o.pts)).length);
  const regions: Region[] = [];
  const regionOf = new Map<Loop, Region>();
  kept.forEach((l, i) => {
    const norm = (ccwWanted: boolean) => { if ((l.area > 0) !== ccwWanted) { l.pts.reverse(); l.area = -l.area; } };
    if (depth[i] % 2 === 0) { norm(true); const r = { outer: l, holes: [] }; regions.push(r); regionOf.set(l, r); }
    else {
      norm(false);
      // immediate parent = smallest outline containing it
      const parent = kept.slice(0, i).filter((o, j) => depth[j] % 2 === 0 && inside(l.pts[0], o.pts)).pop();
      if (parent) regionOf.get(parent)?.holes.push(l);
    }
  });
  const d = (p: Pt[]) => `M${p.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`;
  const svg = regions.map((r) => d(r.outer.pts) + r.holes.map((h) => d(h.pts)).join("")).join("");
  const points = regions.reduce((s, r) => s + r.outer.pts.length + r.holes.reduce((t, h) => t + h.pts.length, 0), 0);
  return { regions, width: mask.width, height: mask.height, svg, points };
}

/* ───────────── 3a. Relief from vectors ───────────── */

export interface ReliefOpts {
  kind: JewelKind;
  /** longest side of the piece in mm (one earring for pairs) */
  sizeMm: number;
  metal: Metal;
  /** cut-out photo with transparency, same pixel space as the vectors */
  photo: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  /** 0–1: how domed the piece is */
  dome?: number;
}

/** Chamfer distance transform (px to the nearest background pixel) on a downsampled mask. */
function distanceField(mask: HTMLCanvasElement, maxSide = 384) {
  const { g, W, H, k } = grid(mask, maxSide);
  const D = new Float32Array(W * H);
  for (let i = 0; i < D.length; i++) D[i] = g[i] ? 1e9 : 0;
  const a = 1, b = Math.SQRT2;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (!D[i]) continue;
    D[i] = Math.min(D[i], D[i - 1] + a, D[i - W] + a, D[i - W - 1] + b, D[i - W + 1] + b);
  }
  for (let y = H - 2; y > 0; y--) for (let x = W - 2; x > 0; x--) {
    const i = y * W + x; if (!D[i]) continue;
    D[i] = Math.min(D[i], D[i + 1] + a, D[i + W] + a, D[i + W + 1] + b, D[i + W - 1] + b);
  }
  // smooth it: raw chamfer distances are piecewise-linear, which shows as terraces once lit
  for (let pass = 0; pass < 4; pass++) {
    const S = D.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (!g[i]) continue;
      S[i] = (D[i] * 4 + D[i - 1] + D[i + 1] + D[i - W] + D[i + W]) / 8;
    }
    D.set(S);
  }
  let max = 0; for (const v of D) if (v < 1e8 && v > max) max = v;
  // sample in mask pixels (bilinear), result in mask pixels
  const at = (px: number, py: number) => {
    const gx = px / k + 1, gy = py / k + 1, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const v = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : Math.min(D[y * W + x], 1e6));
    return ((v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx) * (1 - fy) + (v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx) * fy) * k;
  };
  return { at, max: max * k };
}

/** Normal map from the photo's own detail (Sobel on luminance), so engraving and facets catch light. */
function normalMapFrom(photo: HTMLCanvasElement, strength = 1.1) {
  const s = Math.min(1, 1024 / Math.max(photo.width, photo.height));
  const w = Math.max(2, Math.round(photo.width * s)), h = Math.max(2, Math.round(photo.height * s));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.filter = "blur(1.2px)"; // no 8-bit banding from smooth gradients
  x.drawImage(photo, 0, 0, w, h);
  x.filter = "none";
  const src = x.getImageData(0, 0, w, h), d = src.data;
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255 * (d[i * 4 + 3] / 255);
  const out = x.createImageData(w, h), o = out.data;
  const l = (xx: number, yy: number) => L[Math.min(h - 1, Math.max(0, yy)) * w + Math.min(w - 1, Math.max(0, xx))];
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const gx = (l(xx + 1, yy - 1) + 2 * l(xx + 1, yy) + l(xx + 1, yy + 1)) - (l(xx - 1, yy - 1) + 2 * l(xx - 1, yy) + l(xx - 1, yy + 1));
    const gy = (l(xx - 1, yy + 1) + 2 * l(xx, yy + 1) + l(xx + 1, yy + 1)) - (l(xx - 1, yy - 1) + 2 * l(xx, yy - 1) + l(xx + 1, yy - 1));
    const n = new THREE.Vector3(-gx * strength, gy * strength, 1).normalize();
    const i = (yy * w + xx) * 4;
    o[i] = (n.x * 0.5 + 0.5) * 255; o[i + 1] = (n.y * 0.5 + 0.5) * 255; o[i + 2] = (n.z * 0.5 + 0.5) * 255; o[i + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  return c;
}

/** Pick the regions that make up one piece (earring pairs → the left earring). */
export function pieceRegions(v: Vectors, kind: JewelKind) {
  const big = v.regions[0] ? Math.abs(v.regions[0].outer.area) : 0;
  let regs = v.regions.filter((r) => Math.abs(r.outer.area) > big * 0.02);
  if (isEarring(kind)) {
    const pairs = regs.filter((r) => Math.abs(r.outer.area) > big * 0.4);
    if (pairs.length >= 2) {
      const minX = (r: Region) => Math.min(...r.outer.pts.map((p) => p[0]));
      const maxX = (r: Region) => Math.max(...r.outer.pts.map((p) => p[0]));
      const left = pairs.sort((a, b) => minX(a) - minX(b))[0];
      const split = (maxX(left) + Math.min(...pairs.filter((r) => r !== left).map(minX))) / 2;
      regs = regs.filter((r) => r === left || (!pairs.includes(r) && maxX(r) <= split));
    }
  }
  return regs;
}

/**
 * Bowyer–Watson Delaunay triangulation of a point set; triangles whose centre lies outside the
 * shape (or in a hole) are dropped by the caller. Gives evenly shaped triangles for the dome.
 */
function delaunay(P: { x: number; y: number }[]): number[][] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of P) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const d = Math.max(maxX - minX, maxY - minY) * 20, mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const pts = [...P, { x: mx - d, y: my - d }, { x: mx + d, y: my - d }, { x: mx, y: my + d }];
  const n = P.length;
  type Tri = { a: number; b: number; c: number; x: number; y: number; r2: number };
  const circ = (a: number, b: number, c: number): Tri => {
    const A = pts[a], B = pts[b], C = pts[c];
    const D = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y)) || 1e-12;
    const a2 = A.x * A.x + A.y * A.y, b2 = B.x * B.x + B.y * B.y, c2 = C.x * C.x + C.y * C.y;
    const x = (a2 * (B.y - C.y) + b2 * (C.y - A.y) + c2 * (A.y - B.y)) / D, y = (a2 * (C.x - B.x) + b2 * (A.x - C.x) + c2 * (B.x - A.x)) / D;
    return { a, b, c, x, y, r2: (A.x - x) ** 2 + (A.y - y) ** 2 };
  };
  let tris: Tri[] = [circ(n, n + 1, n + 2)];
  // insert in a spatially coherent order (sorted by x) — keeps it fast
  const order = P.map((_, i) => i).sort((i, j) => P[i].x - P[j].x || P[i].y - P[j].y);
  for (const i of order) {
    const p = pts[i], bad: Tri[] = [], keep: Tri[] = [];
    for (const t of tris) ((p.x - t.x) ** 2 + (p.y - t.y) ** 2 < t.r2 * (1 - 1e-9) ? bad : keep).push(t);
    const edges = new Map<string, [number, number]>();
    for (const t of bad) for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as [number, number][]) {
      const k = u < v ? `${u},${v}` : `${v},${u}`;
      if (edges.has(k)) edges.delete(k); else edges.set(k, [u, v]);
    }
    for (const [u, v] of edges.values()) keep.push(circ(u, v, i));
    tris = keep;
  }
  return tris.filter((t) => t.a < n && t.b < n && t.c < n).map((t) => [t.a, t.b, t.c]);
}

/** Build a solid, domed 3D piece from the vector outline (units: mm, front faces +Z). */
export function buildRelief(v: Vectors, o: ReliefOpts): THREE.Group {
  const regs = pieceRegions(v, o.kind);
  if (!regs.length) throw new Error("No outline found — check the cut-out.");
  const all = regs.flatMap((r) => r.outer.pts);
  const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
  const mmPx = o.sizeMm / Math.max(maxX - minX, maxY - minY);
  // anchor: the hook for earrings (topmost point), top-centre for pendants & necklaces
  let ax = (minX + maxX) / 2, ay = minY;
  if (isEarring(o.kind)) { const top = all.reduce((a, b) => (b[1] < a[1] ? b : a)); ax = top[0]; ay = top[1]; }
  const toMM = (p: Pt) => new THREE.Vector2((p[0] - ax) * mmPx, -(p[1] - ay) * mmPx);

  const df = distanceField(o.mask);
  const rim = Math.max(df.max * 0.65, 1);
  const domeMm = THREE.MathUtils.clamp(0.1 * o.sizeMm, 0.7, 3.4) * (o.dome ?? 0.7) / 0.7;
  const edgeMm = Math.max(0.35, 0.03 * o.sizeMm), backMm = Math.max(0.6, 0.035 * o.sizeMm);
  const lumC = o.photo.getContext("2d", { willReadFrequently: true })!;
  const pd = lumC.getImageData(0, 0, o.photo.width, o.photo.height).data;
  const lum = (px: number, py: number) => {
    const i = (Math.min(o.photo.height - 1, Math.max(0, Math.round(py))) * o.photo.width + Math.min(o.photo.width - 1, Math.max(0, Math.round(px)))) * 4;
    return (0.2126 * pd[i] + 0.7152 * pd[i + 1] + 0.0722 * pd[i + 2]) / 255;
  };
  const domeAt = (px: number, py: number) => { const t = Math.min(1, df.at(px, py) / rim); return edgeMm + domeMm * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))); };
  const heightAt = (px: number, py: number, edge: boolean) => (edge ? edgeMm : domeAt(px, py) + (lum(px, py) - 0.5) * domeMm * 0.08);
  /** surface normal straight from the smooth dome (independent of how it's triangulated) */
  const normalAt = (px: number, py: number) => {
    const e = Math.max(3, rim * 0.12);
    const dx = (domeAt(px + e, py) - domeAt(px - e, py)) / (2 * e * mmPx), dy = (domeAt(px, py + e) - domeAt(px, py - e)) / (2 * e * mmPx);
    return new THREE.Vector3(-dx, dy, 1).normalize(); // image y points down, mm y up
  };
  // necklaces curve back round the neck
  const wrapR = isNeck(o.kind) && o.kind !== "pendant" ? 80 : 0;
  const bend = (x: number, z: number) => (wrapR ? z - (x * x) / (2 * wrapR) : z);
  const uv = (p: Pt) => [p[0] / v.width, 1 - p[1] / v.height];

  const front: number[] = [], frontN: number[] = [], frontUv: number[] = [], frontIdx: number[] = [];
  const back: number[] = [], backIdx: number[] = [];
  const side: number[] = [], sideN: number[] = [], sideIdx: number[] = [];
  const step = Math.max(maxX - minX, maxY - minY) / 46;

  for (const r of regs) {
    const contour = r.outer.pts.map(toMM);
    const holes = r.holes.map((h) => h.pts.map(toMM));
    // interior points so the dome has vertices to rise on (Steiner points = one-point holes)
    const steiner: Pt[] = [];
    const bx0 = Math.min(...r.outer.pts.map((p) => p[0])), bx1 = Math.max(...r.outer.pts.map((p) => p[0]));
    const by0 = Math.min(...r.outer.pts.map((p) => p[1])), by1 = Math.max(...r.outer.pts.map((p) => p[1]));
    for (let y = by0 + step / 2; y < by1; y += step) for (let x = bx0 + step / 2 + ((Math.round((y - by0) / step) % 2) * step) / 2; x < bx1; x += step) {
      const p: Pt = [x, y];
      if (!inside(p, r.outer.pts) || r.holes.some((h) => inside(p, h.pts))) continue;
      if (df.at(x, y) < step * 0.55) continue; // keep clear of the outline
      steiner.push(p);
    }
    const steinerMM = steiner.map((s) => [toMM(s)]);
    // triangulateShape trims duplicate end points in place, so index the arrays after the call
    const edgeCount = contour.length + holes.reduce((n, h) => n + h.length, 0);
    const flatPx: Pt[] = [...contour, ...holes.flat(), ...steinerMM.flat()].map((m) => [m.x / mmPx + ax, -m.y / mmPx + ay]);
    // keep triangles that lie on the metal: centre inside the outline and outside every hole
    const faces = delaunay(flatPx.map(([x, y]) => ({ x, y }))).filter((t) => {
      const c: Pt = [(flatPx[t[0]][0] + flatPx[t[1]][0] + flatPx[t[2]][0]) / 3, (flatPx[t[0]][1] + flatPx[t[1]][1] + flatPx[t[2]][1]) / 3];
      return inside(c, r.outer.pts) && !r.holes.some((h) => inside(c, h.pts));
    });
    const isEdge = flatPx.map((_, i) => i < edgeCount);
    const base = front.length / 3;
    flatPx.forEach((p, i) => {
      const m = toMM(p), zf = heightAt(p[0], p[1], isEdge[i]);
      front.push(m.x, m.y, bend(m.x, zf));
      const nn = normalAt(p[0], p[1]);
      if (wrapR) nn.applyAxisAngle(new THREE.Vector3(0, 1, 0), -m.x / wrapR);
      frontN.push(nn.x, nn.y, nn.z);
      back.push(m.x, m.y, bend(m.x, -backMm));
      frontUv.push(...uv(p));
    });
    for (const f of faces) {
      const [a, b, c] = f.map((i) => base + i);
      const A = flatPx[f[0]], B = flatPx[f[1]], C = flatPx[f[2]];
      // ensure counter-clockwise in the XY plane (y flips when going to mm)
      const ccw = (B[0] - A[0]) * -(C[1] - A[1]) - -(B[1] - A[1]) * (C[0] - A[0]) > 0;
      if (ccw) { frontIdx.push(a, b, c); backIdx.push(a, c, b); } else { frontIdx.push(a, c, b); backIdx.push(a, b, c); }
    }
    // side walls along every loop, with smooth outward normals
    for (const [li, loop] of [r.outer.pts, ...r.holes.map((h) => h.pts)].entries()) {
      const mm = loop.map(toMM), n = mm.length, s0 = side.length / 3;
      // walls face away from the metal: outwards on the outline, into the opening on holes
      const ccwLoop = (signedArea(loop.map(([x, y]) => [x, -y] as Pt)) > 0) !== (li > 0);
      const nrm = (i: number) => {
        const a = mm[(i - 1 + n) % n], b = mm[i], c = mm[(i + 1) % n];
        const e1 = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize(), e2 = new THREE.Vector2(c.x - b.x, c.y - b.y).normalize();
        const t = e1.add(e2).normalize();
        return ccwLoop ? new THREE.Vector2(t.y, -t.x) : new THREE.Vector2(-t.y, t.x);
      };
      for (let i = 0; i < n; i++) {
        const p = mm[i], nn = nrm(i);
        side.push(p.x, p.y, bend(p.x, edgeMm), p.x, p.y, bend(p.x, -backMm));
        sideN.push(nn.x, nn.y, 0, nn.x, nn.y, 0);
      }
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, a = s0 + i * 2, b = s0 + i * 2 + 1, c = s0 + j * 2, d = s0 + j * 2 + 1;
        if (ccwLoop) sideIdx.push(a, b, d, a, d, c); else sideIdx.push(a, d, b, a, c, d);
      }
    }
  }

  const fg = new THREE.BufferGeometry();
  fg.setAttribute("position", new THREE.Float32BufferAttribute(front, 3));
  fg.setAttribute("uv", new THREE.Float32BufferAttribute(frontUv, 2));
  fg.setAttribute("normal", new THREE.Float32BufferAttribute(frontN, 3));
  fg.setIndex(frontIdx);
  const bg = new THREE.BufferGeometry();
  bg.setAttribute("position", new THREE.Float32BufferAttribute(back, 3));
  bg.setIndex(backIdx); bg.computeVertexNormals();
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(side, 3));
  sg.setAttribute("normal", new THREE.Float32BufferAttribute(sideN, 3));
  sg.setIndex(sideIdx);
  const metalGeo = mergeGeometries([bg.toNonIndexed(), sg.toNonIndexed()], false)!;

  const map = new THREE.CanvasTexture(o.photo); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const normalMap = new THREE.CanvasTexture(normalMapFrom(o.photo));
  const photoMat = new THREE.MeshPhysicalMaterial({
    name: "photo", map, normalMap, normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.3, metalness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.12, envMapIntensity: 0.95,
  });
  const metal = metalMaterial(o.metal); metal.name = "metal";
  const g = new THREE.Group();
  g.add(new THREE.Mesh(fg, photoMat), new THREE.Mesh(metalGeo, metal));
  g.userData.anchored = true;
  g.userData.kind = o.kind;
  return g;
}

/* ───────────── 3b. Parametric (rings, bangles) ───────────── */

/** True 3D piece from a spec; materials are named so the shop keeps the stone colour. */
export function buildParametric(spec: JewelSpec): { group: THREE.Group; jewel: Jewel } {
  const j = buildJewel(spec, { wearable: true });
  j.metal.name = "metal";
  if (j.centre) (j.centre.material as THREE.Material).name = `gem:${spec.gem ?? "diamond"}`;
  // rivière / tennis pieces have no centre stone: every stone is the chosen gem
  j.accents.forEach((a) => { (a.material as THREE.Material).name = j.centre ? "gem:diamond" : `gem:${spec.gem ?? "diamond"}`; });
  return { group: j.group, jewel: j };
}

/* ───────────── 4. Export ───────────── */

/** Instanced chains → plain meshes, so every viewer can read the file. */
function bake(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const swaps: [THREE.InstancedMesh, THREE.Mesh][] = [];
  root.traverse((o) => {
    const im = o as THREE.InstancedMesh;
    if (!im.isInstancedMesh) return;
    const parts: THREE.BufferGeometry[] = [], m = new THREE.Matrix4();
    for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); const g = im.geometry.clone().applyMatrix4(m); parts.push(g.index ? g.toNonIndexed() : g); }
    const merged = mergeGeometries(parts, false);
    if (merged) { const mesh = new THREE.Mesh(merged, im.material); mesh.position.copy(im.position); mesh.quaternion.copy(im.quaternion); mesh.scale.copy(im.scale); swaps.push([im, mesh]); }
  });
  swaps.forEach(([a, b]) => { a.parent?.add(b); a.parent?.remove(a); });
}

export async function exportGlb(group: THREE.Group): Promise<ArrayBuffer> {
  const scene = new THREE.Scene();
  // one piece, true millimetres, conventional origin — the shop loader must not split or rescale it
  scene.userData = { ...group.userData, anchored: true, single: true, generator: "Aurelia Photo-to-3D" };
  scene.add(group);
  bake(scene);
  const out = await new GLTFExporter().parseAsync(scene, { binary: true, maxTextureSize: 2048 });
  scene.remove(group);
  if (!(out instanceof ArrayBuffer)) throw new Error("Export failed");
  return out;
}

/** Default real size (mm) per kind for the size field. */
export const DEFAULT_MM: Partial<Record<JewelKind, number>> = { stud: 9, drop: 32, hoop: 22, pendant: 26, riviere: 150, pearlStrand: 150, choker: 130, chain: 150 };
