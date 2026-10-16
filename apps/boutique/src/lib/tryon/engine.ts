/**
 * On-device try-on engine. Uses Google MediaPipe Tasks (face + hand landmarks), loaded
 * lazily from a CDN only when the try-on studio opens. Photos are analysed in the browser
 * and never uploaded.
 */
export type TryOnType = "necklace" | "pendant" | "earrings" | "ring" | "bracelet";
export type Mode = "IMAGE" | "VIDEO";

/**
 * Placement of one overlay item, in fractions of the stage (cx, cy of width/height; w of width).
 * `op` fades an item (e.g. the far earring when the head turns). `ax/ay` is the point of the
 * overlay that sits on the body (0–1 of the overlay), used to pivot sway around the hook.
 */
export interface Placement { cx: number; cy: number; w: number; rot: number; op?: number; ax?: number; ay?: number }
export interface Detection { items: Placement[]; detected: boolean }
interface Pt { x: number; y: number; visibility?: number }

const VERSION = "0.10.14";
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODELS = {
  face: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  hand: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  pose: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
};
type Kind = keyof typeof MODELS;

/** Which body model a piece needs. Necklaces use the body (shoulders + neck); earrings the face mesh. */
export const needs = (t: TryOnType): Kind => (t === "ring" || t === "bracelet" ? "hand" : t === "necklace" || t === "pendant" ? "pose" : "face");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
let visionP: Promise<Any> | null = null;
const loadVision = () => (visionP ??= import(/* @vite-ignore */ `${BASE}/vision_bundle.mjs`).catch((e) => { visionP = null; throw e; }));

const cache: Partial<Record<Kind, Promise<{ lm: Any; mode: Mode }>>> = {};
function landmarker(kind: Kind) {
  return (cache[kind] ??= (async () => {
    const v = await loadVision();
    const files = await v.FilesetResolver.forVisionTasks(`${BASE}/wasm`);
    const Cls = kind === "face" ? v.FaceLandmarker : kind === "hand" ? v.HandLandmarker : v.PoseLandmarker;
    const opts = (delegate: "GPU" | "CPU") => ({
      baseOptions: { modelAssetPath: MODELS[kind], delegate },
      runningMode: "IMAGE",
      ...(kind === "face" ? { numFaces: 1 } : kind === "hand" ? { numHands: 1 } : { numPoses: 1 }),
    });
    let lm: Any;
    try { lm = await Cls.createFromOptions(files, opts("GPU")); } catch { lm = await Cls.createFromOptions(files, opts("CPU")); }
    return { lm, mode: "IMAGE" as Mode };
  })().catch((e) => { delete cache[kind]; throw e; }));
}

/** Warm the model in the background so detection feels instant. */
export function preload(type: TryOnType) { landmarker(needs(type)).catch(() => {}); }

/** Detect landmarks on an <img>, <canvas> or <video>. Returns null when nothing is found. */
export async function detect(type: TryOnType, source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement, mode: Mode, ts = performance.now()): Promise<Pt[] | null> {
  const kind = needs(type);
  const entry = await landmarker(kind);
  if (entry.mode !== mode) { await entry.lm.setOptions({ runningMode: mode }); entry.mode = mode; }
  const r = mode === "VIDEO" ? entry.lm.detectForVideo(source, ts) : entry.lm.detect(source);
  const list = kind === "face" ? r?.faceLandmarks : r?.landmarks;
  return list?.[0] ?? null;
}

/* ── Placement maths ──────────────────────────────────────────────── */

const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const ang = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x);
const deg = (r: number) => (r * 180) / Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Fallback positions (centre of a typical portrait / hand photo) when detection fails. */
export function defaults(type: TryOnType): Placement[] {
  switch (type) {
    case "necklace": return [{ cx: 0.5, cy: 0.66, w: 0.56, rot: 0 }];
    case "pendant": return [{ cx: 0.5, cy: 0.68, w: 0.2, rot: 0 }];
    case "earrings": return [{ cx: 0.33, cy: 0.52, w: 0.08, rot: 0 }, { cx: 0.67, cy: 0.52, w: 0.08, rot: 0 }];
    case "ring": return [{ cx: 0.5, cy: 0.5, w: 0.16, rot: 0 }];
    case "bracelet": return [{ cx: 0.5, cy: 0.62, w: 0.4, rot: 0 }];
  }
}

/**
 * How an overlay sits on the body.
 *  anchor/k/drop — legacy fit (rendered likenesses, auto cut-outs)
 *  anchorPt      — the point of the overlay that touches the body (from the CRM Try-on Studio)
 *  widthMm       — true width of the piece, for real-size display
 */
export interface FitSpec { anchor: "top" | "center"; k: number; drop?: number; aspect: number; anchorPt?: { x: number; y: number } | null; widthMm?: number | null }

/** Typical width (mm) the legacy `k` multiplier is relative to. */
const BASE_MM: Record<TryOnType, number> = { necklace: 140, pendant: 49, earrings: 22, ring: 20, bracelet: 75 };
// Average adult reference sizes used to turn pixels into millimetres.
const IRIS_MM = 11.7;          // horizontal visible iris diameter — remarkably constant across adults
const FACE_MM = 140;           // face width at the cheekbones (fallback when iris isn't available)
const KNUCKLES_MM = 70;        // index-to-little-finger knuckle span
const SHOULDERS_MM = 360;      // shoulder width (acromion to acromion)
const EARS_MM = 150;           // ear-to-ear

/**
 * Convert normalised landmarks to placements. W/H are the media's pixel size so distances
 * are measured correctly on non-square frames. `fit` describes the overlay's own geometry.
 */
export function place(type: TryOnType, lms: Pt[], W: number, H: number, fit: FitSpec): Placement[] {
  const P = (i: number): Pt => ({ x: lms[i].x * W, y: lms[i].y * H, visibility: lms[i].visibility });
  const anchor = fit.anchorPt ?? { x: 0.5, y: fit.anchor === "top" ? 0 : 0.5 };
  const mmToPx = (pxPerMm: number) => (fit.widthMm ? fit.widthMm : fit.k * BASE_MM[type]) * pxPerMm;

  /** Item whose anchor point lands on `a` (px), rotated by `rot` (rad). */
  const item = (a: Pt, wPx: number, rot: number, mirror = false, op = 1): Placement => {
    const ax = mirror ? 1 - anchor.x : anchor.x, ay = anchor.y;
    const hPx = wPx / fit.aspect;
    const ox = (0.5 - ax) * wPx, oy = (0.5 - ay) * hPx;
    const c = { x: a.x + ox * Math.cos(rot) - oy * Math.sin(rot), y: a.y + ox * Math.sin(rot) + oy * Math.cos(rot) };
    return { cx: c.x / W, cy: c.y / H, w: wPx / W, rot: deg(rot), op, ax, ay };
  };

  if (type === "ring" || type === "bracelet") {
    const wrist = P(0), mcp9 = P(9), mcp5 = P(5), mcp17 = P(17), mcp13 = P(13), pip14 = P(14);
    const pxPerMm = d(mcp5, mcp17) / KNUCKLES_MM;
    if (type === "ring") {
      const c = { x: mcp13.x + (pip14.x - mcp13.x) * 0.38, y: mcp13.y + (pip14.y - mcp13.y) * 0.38 };
      return [item(c, mmToPx(pxPerMm), ang(mcp13, pip14) + Math.PI / 2)];
    }
    const len = d(wrist, mcp9);
    const ux = (mcp9.x - wrist.x) / (len || 1), uy = (mcp9.y - wrist.y) / (len || 1);
    const c = { x: wrist.x - ux * len * 0.12, y: wrist.y - uy * len * 0.12 }; // just below the wrist crease
    return [item(c, mmToPx(pxPerMm), ang(wrist, mcp9) + Math.PI / 2)];
  }

  if (type === "necklace" || type === "pendant") {
    // Body landmarks: 0 nose, 2/5 eyes, 7/8 ears, 9/10 mouth, 11/12 shoulders.
    const sL = P(11), sR = P(12), mouth = { x: (P(9).x + P(10).x) / 2, y: (P(9).y + P(10).y) / 2 };
    const seen = (p: Pt) => (p.visibility ?? 1) > 0.55 && p.y < H * 1.02;
    const lineAng = (a: Pt, b: Pt) => { const r = ang(a, b); return r > Math.PI / 2 ? r - Math.PI : r < -Math.PI / 2 ? r + Math.PI : r; };
    if (seen(sL) && seen(sR)) {
      const mid = { x: (sL.x + sR.x) / 2, y: (sL.y + sR.y) / 2 };
      const base = { x: mid.x + (mouth.x - mid.x) * 0.24, y: mid.y + (mouth.y - mid.y) * 0.24 }; // base of the neck
      return [item(base, mmToPx(d(sL, sR) / SHOULDERS_MM), lineAng(sL, sR))];
    }
    // Shoulders out of frame (close selfie): hang below the chin from the head's size and tilt.
    const eL = P(7), eR = P(8), roll = lineAng(P(2), P(5));
    const earW = d(eL, eR), down = { x: -Math.sin(roll), y: Math.cos(roll) };
    const base = { x: mouth.x + down.x * earW * 0.95, y: mouth.y + down.y * earW * 0.95 };
    return [item(base, mmToPx(earW / EARS_MM), roll)];
  }

  // Earrings — face mesh. Roll from the eye line; "down" is perpendicular to it.
  const eyeL = P(33), eyeR = P(263), chin = P(152), top = P(10), sideL = P(234), sideR = P(454), nose = P(1);
  const roll = ang(eyeL, eyeR);
  const down = { x: -Math.sin(roll), y: Math.cos(roll) };
  const faceH = d(top, chin);
  const faceW = d(sideL, sideR);
  // True scale from the irises (landmarks 468–477) when the model provides them.
  const iris = lms.length >= 478 ? (d(P(469), P(471)) + d(P(474), P(476))) / 2 : 0;
  const pxPerMm = iris > 2 ? iris / IRIS_MM : faceW / FACE_MM;
  const lobe = (p: Pt) => ({ x: p.x + down.x * faceH * 0.2, y: p.y + down.y * faceH * 0.2 });
  // Head turn: the side the nose moves towards is turning away — fade that earring behind the face.
  const rL = d(nose, sideL), rR = d(nose, sideR), tot = rL + rR || 1;
  const vis = (share: number) => clamp((share - 0.24) / 0.1, 0, 1);
  const w = mmToPx(pxPerMm);
  return [item(lobe(sideL), w, roll, false, vis(rL / tot)), item(lobe(sideR), w, roll, true, vis(rR / tot))];
}

/** Re-pivot a placement by an extra rotation around its anchor point (used for earring sway). */
export function swing(p: Placement, extraDeg: number, W: number, H: number, aspect: number): Placement {
  if (!extraDeg || p.ax == null || p.ay == null) return p;
  const wPx = p.w * W, hPx = wPx / aspect, r0 = (p.rot * Math.PI) / 180, r1 = ((p.rot + extraDeg) * Math.PI) / 180;
  const ox = (0.5 - p.ax) * wPx, oy = (0.5 - p.ay) * hPx;
  const ax = p.cx * W - (ox * Math.cos(r0) - oy * Math.sin(r0)), ay = p.cy * H - (ox * Math.sin(r0) + oy * Math.cos(r0));
  return { ...p, rot: p.rot + extraDeg, cx: (ax + ox * Math.cos(r1) - oy * Math.sin(r1)) / W, cy: (ay + ox * Math.sin(r1) + oy * Math.cos(r1)) / H };
}

/** Smooth live-camera jitter. */
export function lerp(prev: Placement[] | null, next: Placement[], k = 0.35): Placement[] {
  if (!prev || prev.length !== next.length) return next;
  return next.map((n, i) => ({
    ...n,
    cx: prev[i].cx + (n.cx - prev[i].cx) * k,
    cy: prev[i].cy + (n.cy - prev[i].cy) * k,
    w: prev[i].w + (n.w - prev[i].w) * k,
    rot: prev[i].rot + (n.rot - prev[i].rot) * k,
    op: (prev[i].op ?? 1) + ((n.op ?? 1) - (prev[i].op ?? 1)) * 0.3,
  }));
}

/**
 * One-Euro filter (Casiez et al.) — steady when you hold still, responsive when you move.
 * This is what AR try-on apps use instead of a fixed lerp, which either jitters or lags.
 */
class OneEuro {
  private x: number | null = null; private dx = 0; private t = 0;
  private minCutoff: number; private beta: number; private dCutoff: number;
  constructor(minCutoff = 1.2, beta = 0.02, dCutoff = 1) { this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff; }
  private a(cut: number, dt: number) { const r = 2 * Math.PI * cut * dt; return r / (r + 1); }
  filter(v: number, t: number) {
    if (this.x === null) { this.x = v; this.t = t; return v; }
    const dt = Math.max(1e-3, t - this.t); this.t = t;
    const dv = (v - this.x) / dt;
    this.dx += this.a(this.dCutoff, dt) * (dv - this.dx);
    const cut = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += this.a(cut, dt) * (v - this.x);
    return this.x;
  }
}
/** Smoother for a list of placements (one filter per value). */
export function smoother() {
  let filters: OneEuro[][] = [];
  return (items: Placement[], tSec: number): Placement[] => {
    if (filters.length !== items.length) filters = items.map(() => [new OneEuro(1.0, 4), new OneEuro(1.0, 4), new OneEuro(0.6, 2), new OneEuro(0.8, 0.05), new OneEuro(2, 0)]);
    return items.map((p, i) => {
      const f = filters[i];
      return { ...p, cx: f[0].filter(p.cx, tSec), cy: f[1].filter(p.cy, tSec), w: f[2].filter(p.w, tSec), rot: f[3].filter(p.rot, tSec), op: f[4].filter(p.op ?? 1, tSec) };
    });
  };
}

export const TIPS: Record<TryOnType, string> = {
  necklace: "Step back a little so your shoulders are in view, and face the camera.",
  pendant: "Step back so your neckline and shoulders are in view.",
  earrings: "Face the camera and tuck your hair behind your ears.",
  ring: "Show the back of your hand, fingers together, against a plain background.",
  bracelet: "Show the back of your hand and wrist, sleeve pulled back.",
};
export const LABEL: Record<TryOnType, string> = { necklace: "necklace", pendant: "pendant", earrings: "earrings", ring: "ring", bracelet: "bracelet" };
