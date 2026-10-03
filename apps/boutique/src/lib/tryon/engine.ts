/**
 * On-device try-on engine. Uses Google MediaPipe Tasks (face + hand landmarks), loaded
 * lazily from a CDN only when the try-on studio opens. Photos are analysed in the browser
 * and never uploaded.
 */
export type TryOnType = "necklace" | "pendant" | "earrings" | "ring" | "bracelet";
export type Mode = "IMAGE" | "VIDEO";

/** Placement of one overlay item, in fractions of the stage (cx, cy of width/height; w of width). */
export interface Placement { cx: number; cy: number; w: number; rot: number }
export interface Detection { items: Placement[]; detected: boolean }
interface Pt { x: number; y: number }

const VERSION = "0.10.14";
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODELS = {
  face: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  hand: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
};

export const needs = (t: TryOnType): "face" | "hand" => (t === "ring" || t === "bracelet" ? "hand" : "face");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
let visionP: Promise<Any> | null = null;
const loadVision = () => (visionP ??= import(/* @vite-ignore */ `${BASE}/vision_bundle.mjs`).catch((e) => { visionP = null; throw e; }));

const cache: Partial<Record<"face" | "hand", Promise<{ lm: Any; mode: Mode }>>> = {};
function landmarker(kind: "face" | "hand") {
  return (cache[kind] ??= (async () => {
    const v = await loadVision();
    const files = await v.FilesetResolver.forVisionTasks(`${BASE}/wasm`);
    const Cls = kind === "face" ? v.FaceLandmarker : v.HandLandmarker;
    const opts = (delegate: "GPU" | "CPU") => ({
      baseOptions: { modelAssetPath: MODELS[kind], delegate },
      runningMode: "IMAGE",
      ...(kind === "face" ? { numFaces: 1 } : { numHands: 1 }),
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
 * Convert normalised landmarks to placements. W/H are the media's pixel size so distances
 * are measured correctly on non-square frames.
 */
export function place(type: TryOnType, lms: Pt[], W: number, H: number): Placement[] {
  const P = (i: number): Pt => ({ x: lms[i].x * W, y: lms[i].y * H });
  const out = (p: Pt, wPx: number, rot: number): Placement => ({ cx: p.x / W, cy: p.y / H, w: wPx / W, rot: deg(rot) });

  if (type === "ring" || type === "bracelet") {
    const wrist = P(0), mcp9 = P(9), mcp5 = P(5), mcp17 = P(17), mcp13 = P(13), pip14 = P(14);
    if (type === "ring") {
      const c = { x: mcp13.x + (pip14.x - mcp13.x) * 0.42, y: mcp13.y + (pip14.y - mcp13.y) * 0.42 };
      return [out(c, d(mcp9, mcp13) * 1.15, ang(mcp13, pip14) + Math.PI / 2)];
    }
    const c = { x: wrist.x + (mcp9.x - wrist.x) * 0.06, y: wrist.y + (mcp9.y - wrist.y) * 0.06 };
    return [out(c, d(mcp5, mcp17) * 1.2, ang(wrist, mcp9) + Math.PI / 2)];
  }

  // Face: roll from the eye line, "down" perpendicular to it.
  const eyeL = P(33), eyeR = P(263), chin = P(152), top = P(10), sideL = P(234), sideR = P(454);
  const roll = ang(eyeL, eyeR);
  const down = { x: -Math.sin(roll), y: Math.cos(roll) };
  const faceH = d(top, chin);
  const faceW = d(sideL, sideR);
  const along = (p: Pt, k: number): Pt => ({ x: p.x + down.x * faceH * k, y: p.y + down.y * faceH * k });

  if (type === "necklace") return [out(along(chin, 0.6), faceW * 1.3, roll)];
  if (type === "pendant") return [out(along(chin, 0.72), faceW * 0.42, roll)];
  // earrings: hang from just below each side of the face at ear level
  const ew = faceW * 0.16;
  return [out(along(sideL, 0.3), ew, roll), out(along(sideR, 0.3), ew, roll)];
}

/** Smooth live-camera jitter. */
export function lerp(prev: Placement[] | null, next: Placement[], k = 0.35): Placement[] {
  if (!prev || prev.length !== next.length) return next;
  return next.map((n, i) => ({
    cx: prev[i].cx + (n.cx - prev[i].cx) * k,
    cy: prev[i].cy + (n.cy - prev[i].cy) * k,
    w: prev[i].w + (n.w - prev[i].w) * k,
    rot: prev[i].rot + (n.rot - prev[i].rot) * k,
  }));
}

export const TIPS: Record<TryOnType, string> = {
  necklace: "Face the camera with your neckline visible and shoulders relaxed.",
  pendant: "Face the camera with your neckline visible.",
  earrings: "Face the camera and tuck your hair behind your ears.",
  ring: "Show the back of your hand, fingers together, against a plain background.",
  bracelet: "Show the back of your hand and wrist, sleeve pulled back.",
};
export const LABEL: Record<TryOnType, string> = { necklace: "necklace", pendant: "pendant", earrings: "earrings", ring: "ring", bracelet: "bracelet" };
