/**
 * MediaPipe Tasks Vision for the live 3D try-on — loaded on demand, in the browser only.
 * Face landmarker (478 points incl. irises) and hand landmarker (2 hands + metric world
 * landmarks), VIDEO mode. Falls back from jsDelivr to unpkg and from GPU to CPU.
 */
const VERSION = "0.10.14";
const BASES = [`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`, `https://unpkg.com/@mediapipe/tasks-vision@${VERSION}`];
const MODEL = {
  face: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  hand: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
};
export type TrackKind = keyof typeof MODEL;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
let vision: Promise<{ mod: Any; files: Any }> | null = null;

function loadVision() {
  return (vision ??= (async () => {
    let last: unknown;
    for (const base of BASES) {
      try {
        const mod = await import(/* @vite-ignore */ `${base}/vision_bundle.mjs`);
        const files = await mod.FilesetResolver.forVisionTasks(`${base}/wasm`);
        return { mod, files };
      } catch (e) { last = e; }
    }
    throw new Error(`Couldn't download the tracking engine (${(last as Error)?.message ?? "network"}). Check your connection and try again.`);
  })().catch((e) => { vision = null; throw e; }));
}

export interface Landmarker { detectForVideo(src: TexImageSource, ts: number): Any; close?(): void }
const cache: Partial<Record<TrackKind, Promise<Landmarker>>> = {};

/** Get (and cache) a VIDEO-mode landmarker. */
export function landmarker(kind: TrackKind): Promise<Landmarker> {
  return (cache[kind] ??= (async () => {
    const { mod, files } = await loadVision();
    const make = (delegate: "GPU" | "CPU") => {
      const baseOptions = { modelAssetPath: MODEL[kind], delegate };
      return kind === "face"
        ? mod.FaceLandmarker.createFromOptions(files, { baseOptions, runningMode: "VIDEO", numFaces: 1, minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5 })
        : mod.HandLandmarker.createFromOptions(files, { baseOptions, runningMode: "VIDEO", numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
    };
    try { return await make("GPU"); } catch { return await make("CPU"); }
  })().catch((e) => { delete cache[kind]; throw e; }));
}

/** Warm a model in the background. */
export const warm = (kind: TrackKind) => { landmarker(kind).catch(() => {}); };
