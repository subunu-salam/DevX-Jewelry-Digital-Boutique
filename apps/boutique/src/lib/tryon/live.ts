/**
 * Live 3D try-on session — the controller behind the try-on stage.
 *
 *   camera / photo ─► MediaPipe (face or hands) ─► metric frame (math.ts) ─► One-Euro smoothing
 *                 ─► guided scan (face: centre → turn → turn back; hand: palm → back of hand)
 *                 ─► JewelAR renders the 3D piece with occluders and matched exposure.
 *
 * Framework-free; the React page owns the <video>/<img>/<canvas> elements and listens to
 * `onState`. Nothing is uploaded — frames are processed on the device.
 */
import { createJewelAR, regionOf, usesFace, DEFAULT_FIT, type Fit, type JewelAR, type Region } from "@/lib/jewel3d/ar";
import type { Jewel } from "@/lib/jewel3d/build";
import type { GemKey, JewelSpec, Metal } from "@/lib/jewel3d/spec";
import { FaceSmoother, HandSign, clamp, faceFrame3D, handFilters, handFrame3D, headAngles, type FaceFrame, type HandFrame, type OneEuroV } from "./math";
import { landmarker, type Landmarker } from "./vision";

export interface ScanUi { step: number; steps: number; title: string; hint: string; progress: number; oval: boolean; ok: boolean }
export interface LiveState {
  stage: "loading" | "scan" | "live" | "error";
  status: string;
  tracking: boolean;
  scan?: ScanUi;
  error?: string;
  /** one-off message (e.g. "Scan complete · ear to ear 14.1 cm") */
  note?: string;
}

type Source = HTMLVideoElement | HTMLImageElement;

/** Scan results survive switching pieces and re-opening the studio during this visit. */
const profile: { earDist: number | null; faceDone: boolean; handDone: boolean; sign: HandSign } = { earDist: null, faceDone: false, handDone: false, sign: new HandSign() };

const FACE_STEPS = [
  { t: "Centre your face", p: "Look straight at the camera inside the oval and hold still." },
  { t: "Turn your head to one side", p: "Slowly turn until the bar fills." },
  { t: "Now turn the other way", p: "Slowly turn to the other side." },
];
const HAND_STEPS = [
  { t: "Show your palm", p: "Hold your hand up, palm facing the camera, fingers spread." },
  { t: "Now the back of your hand", p: "Turn your hand over slowly and hold it still." },
];

export class LiveTryOn {
  fit: Fit = { ...DEFAULT_FIT };
  flip = false;
  private ar: JewelAR | null = null;
  private region: Region = "ring";
  private src: Source | null = null;
  private still = false;
  private lm: Landmarker | null = null;
  private raf = 0;
  private alive = true;
  private last = 0; private dt = 0; private lastVT = -1; private ts = 0; private tick = 0; private lost = 0;
  private face: FaceFrame | null = null;
  private hand: HandFrame | null = null;
  private faceF = new FaceSmoother();
  private handF: OneEuroV[][] = [handFilters(), handFilters()];
  private lum = 0.5;
  private probe = document.createElement("canvas");
  private stage: LiveState["stage"] = "loading";
  private scan = { step: 0, hold: 0, side: 0, prog: 0, t0: 0, ear: [] as number[] };
  private lastStatus = "";

  constructor(private canvas: HTMLCanvasElement, private onState: (s: LiveState) => void) { this.probe.width = this.probe.height = 16; }

  /** Swap the piece; keeps the camera, the scan and the fit. */
  setPiece(spec: JewelSpec, model: Jewel | null) {
    const prev = this.region;
    this.ar?.dispose();
    this.ar = createJewelAR(this.canvas, spec, model);
    this.region = regionOf(spec);
    if (usesFace(prev) !== usesFace(this.region)) { this.lm = null; this.face = null; this.hand = null; if (this.src) void this.begin(); }
  }
  setMetal(m: Metal) { this.ar?.setMetal(m); }
  setGem(g: GemKey) { this.ar?.setGem(g); }

  /** Start tracking a <video> (live) or <img> (photo). */
  async attach(src: Source, still: boolean) {
    this.src = src; this.still = still;
    await this.begin();
  }

  private async begin() {
    const face = usesFace(this.region);
    this.emit({ stage: "loading", status: face ? "Loading face tracking…" : "Loading hand tracking…", tracking: false });
    try {
      this.lm = await landmarker(face ? "face" : "hand");
    } catch (e) {
      this.emit({ stage: "error", status: "Tracking unavailable", tracking: false, error: (e as Error).message });
      return;
    }
    if (!this.alive) return;
    const done = face ? profile.faceDone : profile.handDone;
    if (this.still || done) this.goLive(); else this.startScan();
    this.loop();
  }

  startScan() {
    if (this.still) return;
    this.stage = "scan";
    this.scan = { step: 0, hold: 0, side: 0, prog: 0, t0: performance.now(), ear: [] };
    this.face = null; this.hand = null;
    this.scanEmit(0);
  }
  skipScan() { this.finishScan(true); }

  private goLive(note?: string) {
    this.stage = "live";
    this.emit({ stage: "live", status: "Looking for you…", tracking: false, note });
  }

  private loop() {
    if (this.raf) return;
    this.last = performance.now();
    const step = (now: number) => {
      if (!this.alive) return;
      this.raf = requestAnimationFrame(step);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(step);
  }

  private ready(): { W: number; H: number } | null {
    const s = this.src;
    if (!s) return null;
    if (s instanceof HTMLVideoElement) return s.readyState >= 2 && s.videoWidth ? { W: s.videoWidth, H: s.videoHeight } : null;
    return s.complete && s.naturalWidth ? { W: s.naturalWidth, H: s.naturalHeight } : null;
  }

  private frame(now: number) {
    this.dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    const dims = this.ready();
    if (!dims || !this.ar || !this.lm) return;
    // detect once per new video frame (photos ~8 fps)
    const vt = this.still ? Math.floor(now / 120) : (this.src as HTMLVideoElement).currentTime;
    if (vt !== this.lastVT) { this.lastVT = vt; this.detect(dims.W, dims.H, now); }
    if (this.stage === "scan") this.scanUpdate();
    const show = this.stage === "live";
    const on = this.ar.render(show ? {
      W: dims.W, H: dims.H, dt: this.dt, fit: this.fit, flip: this.flip, lum: this.lum,
      face: this.face, hand: this.hand, palmToCamera: this.hand ? profile.sign.palmToCamera(this.hand) : false,
      earDist: profile.earDist,
    } : null);
    if (show) {
      const st = on ? "Tracking" : usesFace(this.region) ? "Face the camera" : "Show your hand";
      if (st !== this.lastStatus) this.emit({ stage: "live", status: st, tracking: on });
    }
  }

  private detect(W: number, H: number, now: number) {
    const src = this.src!;
    this.ts = Math.max(now, this.ts + 1);
    try {
      const r = this.lm!.detectForVideo(src, this.ts);
      if (usesFace(this.region)) {
        const l = r?.faceLandmarks?.[0];
        const fr = l && l.length >= 478 ? faceFrame3D(l, W, H) : null;
        if (fr) { this.face = this.faceF.filter(fr, now); this.lost = 0; }
        else if (++this.lost > 6) { this.face = null; this.faceF.reset(); }
      } else {
        let best: HandFrame | null = null;
        const n = r?.landmarks?.length ?? 0;
        for (let i = 0; i < n; i++) {
          const label = (r.handedness?.[i]?.[0]?.categoryName ?? "Right") as "Left" | "Right";
          const h = handFrame3D(r.landmarks[i], r.worldLandmarks[i], W, H, this.handF[i] ?? null, now, label);
          if (h && (!best || h.span > best.span)) best = h; // nearest hand wins
        }
        if (best) { this.hand = best; this.lost = 0; }
        else if (++this.lost > 8) { this.hand = null; this.handF = [handFilters(), handFilters()]; }
      }
    } catch { /* a dropped frame */ }
    if (this.tick++ % 20 === 0) this.measureLight(src);
  }

  private measureLight(src: Source) {
    try {
      const x = this.probe.getContext("2d", { willReadFrequently: true })!;
      x.drawImage(src, 0, 0, 16, 16);
      const d = x.getImageData(0, 0, 16, 16).data;
      let s = 0; for (let i = 0; i < d.length; i += 4) s += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      this.lum = this.lum * 0.8 + (s / 256) * 0.2;
    } catch { /* tainted */ }
  }

  /* ── guided scan ── */
  private scanEmit(progress: number, hint?: string, ok = false) {
    const steps = usesFace(this.region) ? FACE_STEPS : HAND_STEPS;
    const s = steps[this.scan.step];
    if (!s) return;
    this.emit({
      stage: "scan", tracking: !!(this.face || this.hand), status: this.face || this.hand ? (usesFace(this.region) ? "Face found" : "Hand found") : "Searching",
      scan: { step: this.scan.step, steps: steps.length, title: s.t, hint: hint ?? s.p, progress: clamp(progress, 0, 1), oval: usesFace(this.region), ok },
    });
  }

  private scanUpdate() {
    const sc = this.scan, dt = this.dt;
    if (performance.now() - sc.t0 > 40000) { this.finishScan(true); return; }
    if (usesFace(this.region)) {
      const f = this.face;
      if (!f) { sc.hold = 0; this.scanEmit(0, "No face found yet. Move into the oval with light on your face."); return; }
      const { yaw, pitch } = headAngles(f);
      if (sc.step === 0) {
        const ok = Math.abs(yaw) < 12 && Math.abs(pitch) < 14 && f.Z > 28 && f.Z < 85;
        if (ok) { sc.hold += dt; sc.ear.push(f.earDist); } else sc.hold = Math.max(0, sc.hold - dt * 2);
        const hint = f.Z <= 28 ? "A little further back please." : f.Z >= 85 ? "Move a little closer." : Math.abs(yaw) >= 12 ? "Face the camera straight on." : Math.abs(pitch) >= 14 ? "Level your head — chin neither up nor down." : undefined;
        this.scanEmit(sc.hold / 1.4, hint, ok);
        if (sc.hold > 1.4) { sc.step = 1; sc.hold = 0; sc.prog = 0; }
      } else if (sc.step === 1) {
        const p = clamp((Math.abs(yaw) - 6) / 16, 0, 1);
        if (p > sc.prog) { sc.prog = p; sc.side = Math.sign(yaw); }
        this.scanEmit(sc.prog);
        if (sc.prog >= 1) { sc.step = 2; sc.prog = 0; }
      } else {
        const p = clamp((-sc.side * yaw - 6) / 16, 0, 1);
        sc.prog = Math.max(sc.prog, p);
        this.scanEmit(sc.prog, sc.prog < 0.05 && sc.side * yaw > 6 ? "The other way — turn past the centre." : undefined);
        if (sc.prog >= 1) this.finishScan(false);
      }
    } else {
      const h = this.hand;
      if (!h) { sc.hold = 0; this.scanEmit(0, "No hand found yet. Raise it into view with good light."); return; }
      if (sc.step === 0) {
        sc.hold += dt; this.scanEmit(sc.hold / 1.2, undefined, true);
        if (sc.hold > 1.2) { profile.sign.calibratePalm(h); sc.hold = 0; sc.step = 1; }
      } else {
        const back = !profile.sign.palmToCamera(h);
        sc.hold = back ? sc.hold + dt : Math.max(0, sc.hold - dt);
        this.scanEmit(sc.hold, back ? undefined : "Turn your hand over so the back faces the camera.", back);
        if (sc.hold > 1.0) this.finishScan(false);
      }
    }
  }

  private finishScan(skipped: boolean) {
    const a = this.scan.ear.slice().sort((x, y) => x - y);
    if (usesFace(this.region)) {
      if (a.length) profile.earDist = a[a.length >> 1];
      profile.faceDone = true;
    } else profile.handDone = true;
    this.goLive(skipped ? undefined : usesFace(this.region) && profile.earDist ? `Scan complete · ear to ear ${profile.earDist.toFixed(1)} cm` : "Scan complete");
  }

  private lastKey = "";
  private emit(s: LiveState) {
    this.stage = s.stage; this.lastStatus = s.status;
    if (s.scan) s.scan.progress = Math.round(s.scan.progress * 50) / 50;
    const key = JSON.stringify(s);
    if (key === this.lastKey) return; // React re-renders only on real changes
    this.lastKey = key;
    this.onState(s);
  }

  /** Photo + 3D piece + watermark, as a JPEG data URL. `mirror` matches a selfie preview. */
  capture(mirror: boolean, label: string): string | null {
    const src = this.src, dims = this.ready();
    if (!src || !dims || !this.ar) return null;
    const c = document.createElement("canvas");
    c.width = dims.W; c.height = dims.H;
    const x = c.getContext("2d")!;
    x.save(); if (mirror) { x.translate(c.width, 0); x.scale(-1, 1); }
    x.drawImage(src, 0, 0, c.width, c.height);
    try { x.drawImage(this.canvas, 0, 0, c.width, c.height); } catch { /* ignore */ }
    x.restore();
    const band = Math.max(28, Math.round(c.height * 0.045));
    x.fillStyle = "rgba(46,33,27,0.72)"; x.fillRect(0, c.height - band, c.width, band);
    x.fillStyle = "#F7E6DA"; x.font = `600 ${Math.round(band * 0.36)}px Manrope, system-ui, sans-serif`;
    x.textBaseline = "middle"; x.textAlign = "center";
    x.fillText(`AURELIA  ·  ${label.toUpperCase()}  ·  VIRTUAL TRY-ON`, c.width / 2, c.height - band / 2);
    return c.toDataURL("image/jpeg", 0.92);
  }

  /** Raw current frame (no overlay), un-mirrored as the camera saw it. */
  frameImage(mirror: boolean): string | null {
    const src = this.src, dims = this.ready();
    if (!src || !dims) return null;
    const c = document.createElement("canvas"); c.width = dims.W; c.height = dims.H;
    const x = c.getContext("2d")!;
    if (mirror) { x.translate(c.width, 0); x.scale(-1, 1); }
    x.drawImage(src, 0, 0);
    return c.toDataURL("image/jpeg", 0.92);
  }

  detach() { cancelAnimationFrame(this.raf); this.raf = 0; this.src = null; this.face = null; this.hand = null; }
  dispose() { this.alive = false; this.detach(); this.ar?.dispose(); this.ar = null; }
}

/** Forget the scan (e.g. a different person picks up the phone). */
export function resetProfile() { profile.earDist = null; profile.faceDone = false; profile.handDone = false; profile.sign = new HandSign(); }
