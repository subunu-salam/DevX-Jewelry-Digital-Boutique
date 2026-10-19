/**
 * Real-3D AR try-on, rebuilt in metric camera space (millimetres).
 *
 * Every frame the landmarks are back-projected into a perspective camera that matches the photo or
 * video, so the piece sits at the right depth and perspective instead of being pasted on top:
 *
 *  • Depth & scale — faces: from the iris (11.7 mm, near-constant in adults); hands: from MediaPipe's
 *    metric world landmarks against their on-screen length. Jewellery is modelled in real mm.
 *  • Occlusion — invisible depth-only head (ellipsoid), neck, finger and wrist volumes hide the parts
 *    of a piece that go behind you: the far earring as you turn, the chain round the back of the
 *    neck, the back of a ring band or bangle.
 *  • Contact shadows — the same volumes (plus a chest plane) catch real shadows cast by the piece.
 *  • Physics — drops and jhumkas hang with gravity and swing as a damped pendulum when you move.
 *  • Smoothing — One-Euro filters (steady when still, responsive when moving) on landmarks and pose.
 *  • Hands — palm vs. back from the hand's chirality, so a ring's head is always on the back of
 *    the finger; size adapts to the finger/wrist.
 *  • Light — exposure and a tint follow the room, so gold doesn't glow in a dim scene.
 */
import * as THREE from "three";
import { buildJewel, type Jewel } from "./build";
import { makeRenderer, studioEnvironment } from "./stage";
import { isEarring, isNeck, isWrist, type JewelSpec } from "./spec";
import type { Lm3, Tracked } from "../tryon/engine";

const V3 = THREE.Vector3;
type V = THREE.Vector3;
const WUP = new V3(0, 1, 0);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const IRIS_MM = 11.7, FACE_MM = 140, EARS_REF = 142;

/** User fine-tuning on top of the automatic fit. */
export interface Fit { size: number; height: number; depth: number; flip: boolean }
export const DEFAULT_FIT: Fit = { size: 1, height: 0, depth: 0, flip: false };
export interface FrameInfo {
  /** scene brightness 0–1 */
  lum?: number;
  /** average scene colour 0–1 */
  tint?: [number, number, number];
  /** a still photo (no smoothing / physics) */
  still?: boolean;
}

export interface JewelAR {
  /** Feed one frame of tracking (null = nothing found). Returns true while the piece is placed. */
  update(t: Tracked | null, W: number, H: number, info?: FrameInfo): boolean;
  setFit(f: Partial<Fit>): void;
  /** The landmark model this piece needs. */
  readonly kind: "face" | "hand";
  snapshot(): string;
  dispose(): void;
}
export type RingAR = JewelAR;

/* ───────────── One-Euro filters ───────────── */

class OneEuro {
  private x: number | null = null; private dx = 0; private t = 0;
  constructor(private minCut = 1, private beta = 0, private dCut = 1) {}
  private a(cut: number, dt: number) { const r = 2 * Math.PI * cut * dt; return r / (r + 1); }
  reset() { this.x = null; this.dx = 0; }
  filter(v: number, t: number) {
    if (this.x === null) { this.x = v; this.t = t; return v; }
    const dt = Math.max(1e-3, t - this.t); this.t = t;
    this.dx += this.a(this.dCut, dt) * ((v - this.x) / dt - this.dx);
    this.x += this.a(this.minCut + this.beta * Math.abs(this.dx), dt) * (v - this.x);
    return this.x;
  }
}
class OneEuroV3 {
  private f: OneEuro[];
  constructor(minCut: number, beta: number) { this.f = [0, 1, 2].map(() => new OneEuro(minCut, beta)); }
  reset() { this.f.forEach((x) => x.reset()); }
  filter(v: V, t: number) { return new V3(this.f[0].filter(v.x, t), this.f[1].filter(v.y, t), this.f[2].filter(v.z, t)); }
}
class OneEuroQuat {
  private f: OneEuro[]; private last: THREE.Quaternion | null = null;
  constructor(minCut: number, beta: number) { this.f = [0, 1, 2, 3].map(() => new OneEuro(minCut, beta)); }
  reset() { this.f.forEach((x) => x.reset()); this.last = null; }
  filter(q: THREE.Quaternion, t: number) {
    const s = q.clone();
    if (this.last && this.last.dot(s) < 0) s.set(-s.x, -s.y, -s.z, -s.w); // stay on one hemisphere
    const o = new THREE.Quaternion(this.f[0].filter(s.x, t), this.f[1].filter(s.y, t), this.f[2].filter(s.z, t), this.f[3].filter(s.w, t)).normalize();
    this.last = o.clone();
    return o;
  }
}

/* ───────────── Scene helpers ───────────── */

const depthOnly = () => new THREE.MeshBasicMaterial({ colorWrite: false });
const catcher = (opacity: number) => new THREE.ShadowMaterial({ opacity, depthWrite: false });

/** Invisible volume that hides what's behind it and catches the piece's shadow. */
function occluder(geo: THREE.BufferGeometry, shadow = 0.2) {
  const g = new THREE.Group();
  const hide = new THREE.Mesh(geo, depthOnly());
  hide.renderOrder = -2;
  const sh = new THREE.Mesh(geo, catcher(shadow));
  sh.scale.setScalar(1.012); sh.receiveShadow = true; sh.renderOrder = -1;
  g.add(hide, sh);
  return g;
}

const basisQuat = (x: V, y: V, z: V) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));

/** Bounding box of an object in its parent's space. */
function boxOf(o: THREE.Object3D) { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); }

/* ───────────── Engine ───────────── */

export function createJewelAR(canvas: HTMLCanvasElement, spec: JewelSpec, model?: Jewel | null): JewelAR {
  const renderer = makeRenderer(canvas, true);
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  const camera = new THREE.PerspectiveCamera(50, 1, 5, 6000);

  // Room light: a tinted sky light + a key light that casts the contact shadows.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 0.35);
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.6; key.shadow.radius = 4;
  scene.add(hemi, key, key.target);

  const ear = isEarring(spec.kind), neck = isNeck(spec.kind), wrist = isWrist(spec.kind), ring = spec.kind === "ring";
  const kind: "face" | "hand" = ring || wrist ? "hand" : "face";
  let fit: Fit = { ...DEFAULT_FIT };

  /* pieces */
  const count = ear ? 2 : 1;
  const holders: THREE.Group[] = [];
  const jewels: Jewel[] = [];
  for (let i = 0; i < count; i++) {
    const j: Jewel = model ? { ...model, group: i === 0 ? model.group : model.group.clone() } : buildJewel(spec, { wearable: true });
    const inner = new THREE.Group();
    inner.add(j.group);
    // Imported / photo-made models: put the hook (earrings) or neck point (necklaces) at the origin.
    if (model && (ear || neck) && !model.group.userData.anchored) {
      const b = boxOf(j.group), c = b.getCenter(new V3());
      j.group.position.sub(new V3(c.x, b.max.y, c.z));
    }
    if (ear && i === 1) inner.scale.x = -1; // the pair is mirrored
    j.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
    const h = new THREE.Group();
    h.add(inner);
    h.visible = false;
    scene.add(h); holders.push(h); jewels.push(j);
  }
  /** How far a piece hangs below its hook (mm) — studs barely move, drops swing. */
  const hang = ear ? Math.max(0, -boxOf(holders[0].children[0]).min.y) : 0;
  const swayK = clamp((hang - 8) / 18, 0, 1);
  const innerR = Math.max(1, jewels[0].innerR || (ring ? 8.6 : 29));

  /* body volumes */
  const unitSphere = new THREE.SphereGeometry(1, 40, 28);
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 40, 1, false);
  let head: THREE.Group | null = null, neckOcc: THREE.Group | null = null, chest: THREE.Mesh | null = null, limb: THREE.Group | null = null;
  if (ear || neck) { head = occluder(unitSphere, 0.16); head.visible = false; scene.add(head); }
  if (neck) {
    // Neck + chest live in the necklace's own frame (origin = front base of the neck).
    neckOcc = occluder(unitCyl, 0.2);
    neckOcc.scale.set(47, 190, 43); neckOcc.position.set(0, 70, -47);
    holders[0].add(neckOcc);
    chest = new THREE.Mesh(new THREE.PlaneGeometry(420, 360), catcher(0.2));
    chest.position.set(0, -150, -4.5); chest.rotation.x = -0.12; chest.receiveShadow = true; chest.renderOrder = -1;
    holders[0].add(chest);
  }
  if (ring || wrist) {
    // Finger / forearm along the piece's axis (local Y); the wrist is an ellipse, wider across.
    limb = occluder(unitCyl, 0.18);
    if (ring) limb.scale.set(innerR * 0.97, 64, innerR * 0.97);
    else { limb.scale.set(innerR * 0.9, 200, innerR * 0.7); limb.position.y = -55; } // runs up the forearm
    holders[0].add(limb);
  }

  /* camera from the media size */
  let W = 0, H = 0, f = 1;
  const resize = () => renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false);
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
  function setMedia(w: number, h: number) {
    if (w === W && h === H) return;
    W = w; H = h; f = 0.9 * Math.max(W, H); // ≈ 58° across the long side — typical phone / laptop camera
    camera.fov = (2 * Math.atan(H / 2 / f) * 180) / Math.PI;
    camera.aspect = W / H; camera.updateProjectionMatrix();
    resetFilters();
  }

  /* filters & physics state */
  const F = {
    earMid: new OneEuroV3(1.3, 0.004), a: new OneEuroV3(1.5, 0.005), b: new OneEuroV3(1.5, 0.005),
    q: new OneEuroQuat(1.1, 0.5), earDist: new OneEuro(0.6, 0),
    hand: Array.from({ length: 21 }, () => new OneEuroV3(1.8, 0.006)),
  };
  function resetFilters() { F.earMid.reset(); F.a.reset(); F.b.reset(); F.q.reset(); F.earDist.reset(); F.hand.forEach((x) => x.reset()); sway.forEach((s) => { s.a = 0; s.v = 0; s.px = null; s.pv = 0; }); }
  const sway = [0, 1].map(() => ({ a: 0, v: 0, px: null as number | null, pv: 0 }));
  let lastT = performance.now() / 1000;
  /** chirality as seen, with hysteresis so a flickering label doesn't flip the ring */
  let chir: { label: string; n: number; cand: string | null } = { label: "Left", n: 0, cand: null };

  let last: { t: Tracked | null; W: number; H: number; info?: FrameInfo } | null = null;

  /** landmark → camera space (mm, y up, camera looking down −z) */
  const bp = (l: Lm3, Z: number, zRef: number) => {
    const Zi = Math.max(60, Z + ((l.z ?? 0) - zRef) * W * Z / f);
    return new V3(((l.x * W - W / 2) / f) * Zi, (-(l.y * H - H / 2) / f) * Zi, -Zi);
  };

  function faceFrame(lms: Lm3[], t: number, still: boolean) {
    const d = (a: number, b: number) => Math.hypot((lms[a].x - lms[b].x) * W, (lms[a].y - lms[b].y) * H);
    const iris = lms.length >= 478 ? (Math.max(d(469, 471), d(470, 472)) + Math.max(d(474, 476), d(475, 477))) / 2 : 0;
    const Z = iris > 1.5 ? (f * IRIS_MM) / iris : (f * FACE_MM) / Math.max(1, d(234, 454));
    if (!(Z > 120 && Z < 2600)) return null;
    const zRef = lms.length >= 478 ? (lms[468].z + lms[473].z) / 2 : lms[1].z;
    const P = (i: number) => bp(lms[i], Z, zRef);
    let a = P(234), b = P(454);
    if (a.x > b.x) [a, b] = [b, a]; // a = viewer-left contour
    const right = b.clone().sub(a).normalize();
    let up = P(10).sub(P(152)).normalize();
    const fwd = new V3().crossVectors(right, up).normalize();
    up = new V3().crossVectors(fwd, right).normalize();
    let q = basisQuat(right, up, fwd), earMid = a.clone().lerp(b, 0.5), earDist = a.distanceTo(b);
    if (!still) { q = F.q.filter(q, t); earMid = F.earMid.filter(earMid, t); a = F.a.filter(a, t); b = F.b.filter(b, t); earDist = F.earDist.filter(earDist, t); }
    const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
    const R = new V3(), U = new V3(), Fw = new V3();
    m.extractBasis(R, U, Fw);
    return { a, b, right: R, up: U, fwd: Fw, earMid, earDist, q };
  }

  function placeFace(lms: Lm3[], t: number, dt: number, still: boolean) {
    if (lms.length < 468) return false;
    const fr = faceFrame(lms, t, still);
    if (!fr) return false;
    const body = clamp(fr.earDist / EARS_REF, 0.85, 1.15);

    // head volume — hides the far earring as you turn and the chain behind the neck
    if (head) {
      const hc = fr.earMid.clone().addScaledVector(fr.up, 14).addScaledVector(fr.fwd, -4);
      head.position.copy(hc); head.quaternion.copy(fr.q);
      head.scale.set((fr.earDist / 2) * 0.93, 106 * body, 96 * body);
      head.visible = true;
    }

    if (ear) {
      for (let side = 0; side < 2; side++) {
        const P = side ? fr.b : fr.a, out = side ? fr.right : fr.right.clone().negate();
        const lobe = P.clone()
          .addScaledVector(fr.up, -22.5 * body + fit.height * 10)
          .addScaledVector(fr.fwd, -14.5 * body - fit.depth * 6)
          .addScaledVector(out, 2.5);
        const fan = (side ? 1 : -1) * 0.28;
        let q: THREE.Quaternion;
        if (swayK < 0.05) {
          // studs are fixed to the lobe: they turn with the head
          q = fr.q.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(fr.up, fan));
        } else {
          // drops hang with gravity (yaw only) and swing like a damped pendulum
          const fh = new V3(fr.fwd.x, 0, fr.fwd.z).normalize().applyAxisAngle(WUP, fan);
          const s = sway[side];
          if (!still && s.px !== null) {
            const steps = Math.max(1, Math.ceil(dt / 0.016)), h = dt / steps;
            const vx = (lobe.x - s.px) / dt, ax = (vx - s.pv) / dt; s.pv = vx;
            for (let k = 0; k < steps; k++) {
              s.v += (-ax * 0.00009 - 160 * s.a - 7.5 * s.v) * h;
              s.v = clamp(s.v, -9, 9); s.a = clamp(s.a + s.v * h, -0.45, 0.45);
            }
          }
          s.px = lobe.x;
          const ang = s.a * swayK;
          const Y = WUP.clone().applyAxisAngle(fh, ang), X = new V3().crossVectors(Y, fh).normalize();
          q = basisQuat(X, Y, fh);
        }
        const h = holders[side];
        h.position.copy(lobe); h.quaternion.copy(q); h.scale.setScalar(fit.size);
        h.visible = true;
      }
    } else if (neck) {
      // The body faces the camera more than the head does; the chain follows a little of the head's roll.
      const roll = Math.atan2(fr.right.y, fr.right.x) * 0.45;
      const bf = new V3(fr.fwd.x * 0.35, 0, 1).normalize();
      const dn = fr.up.clone().add(WUP).normalize();
      const origin = fr.earMid.clone()
        .addScaledVector(dn, -(118 * body - fit.height * 14))
        .addScaledVector(bf, 40 * body + fit.depth * 10);
      const Y0 = WUP.clone().applyAxisAngle(new V3(0, 0, 1), roll);
      const X = new V3().crossVectors(Y0, bf).normalize(), Y = new V3().crossVectors(bf, X).normalize();
      const h = holders[0];
      h.position.copy(origin); h.quaternion.copy(basisQuat(X, Y, bf)); h.scale.setScalar(body * fit.size);
      h.visible = true;
    }
    return true;
  }

  function placeHand(tr: Tracked, t: number, still: boolean) {
    const lm = tr.lms, wl = tr.world;
    if (lm.length < 21 || !wl || wl.length < 21) return false;
    const px = (i: number) => new THREE.Vector2(lm[i].x * W, lm[i].y * H);
    const wd = (i: number) => new V3(wl[i].x, -wl[i].y, -wl[i].z);
    const bones: [number, number][] = [[0, 5], [0, 17], [5, 9], [9, 13], [13, 17], [5, 17], [0, 9], [0, 13]];
    let sp = 0, sw = 0;
    for (const [a, b] of bones) { sp += px(a).distanceTo(px(b)); sw += wd(a).distanceTo(wd(b)) * 1000; }
    if (sp < 24 || sw < 30) return false;
    const Z = Math.max(80, (f * sw) / sp), zRef = (wl[0].z + wl[5].z + wl[17].z) / 3;
    const P = (i: number) => {
      const Zi = Z + (wl[i].z - zRef) * 1000;
      const p = new V3(((lm[i].x * W - W / 2) / f) * Zi, (-(lm[i].y * H - H / 2) / f) * Zi, -Zi);
      return still ? p : F.hand[i].filter(p, t);
    };
    const p0 = P(0), p5 = P(5), p9 = P(9), p13 = P(13), p14 = P(14), p17 = P(17);
    const span = p5.distanceTo(p17);

    // Chirality as seen: MediaPipe assumes a mirrored image, so "Left" = a right hand as it appears.
    const label = tr.handed ?? chir.label;
    if (still) chir = { label, n: 0, cand: null };
    else if (label !== chir.label) {
      if (chir.cand === label) { if (++chir.n >= 4) chir = { label, n: 0, cand: null }; }
      else chir = { ...chir, cand: label, n: 1 };
    } else chir.cand = null;
    // cross(index−wrist, pinky−wrist) points out of the palm for a hand that looks right-handed
    let palmOut = new V3().crossVectors(p5.clone().sub(p0), p17.clone().sub(p0)).normalize();
    if (chir.label !== "Left") palmOut.negate();
    if (fit.flip) palmOut = palmOut.negate();
    const dorsal = palmOut.clone().negate();

    let pos: V, axis: V, s: number;
    if (ring) {
      axis = p14.clone().sub(p13).normalize();
      pos = p13.clone().lerp(p14, clamp(0.38 + fit.depth * 0.08, 0.1, 0.8));
      const fingerR = 0.118 * span;
      s = ((fingerR * 1.02) / innerR) * fit.size;
    } else {
      axis = p0.clone().sub(p9).normalize(); // towards the forearm
      pos = p0.clone().addScaledVector(axis, 18 + fit.height * 10);
      const wristW = 0.8 * span;
      s = ((wristW / 2) * 1.08 / innerR) * fit.size;
      axis.negate(); // piece's +Y points towards the fingers
    }
    const z = dorsal.clone().addScaledVector(axis, -dorsal.dot(axis)).normalize();
    const x = new V3().crossVectors(axis, z).normalize();
    const h = holders[0];
    h.position.copy(pos); h.quaternion.copy(basisQuat(x, axis, z)); h.scale.setScalar(s);
    h.visible = true;
    return true;
  }

  function aimShadow() {
    const vis = holders.filter((h) => h.visible);
    if (!vis.length) return;
    const c = new V3();
    vis.forEach((h) => c.add(h.position));
    c.divideScalar(vis.length);
    const reach = neck ? 260 : ear ? 200 : wrist ? 140 : 70;
    key.target.position.copy(c);
    key.position.copy(c).add(new V3(0.25, 1, 0.55).normalize().multiplyScalar(600));
    const sc = key.shadow.camera;
    sc.left = -reach; sc.right = reach; sc.top = reach; sc.bottom = -reach; sc.near = 50; sc.far = 1400;
    sc.updateProjectionMatrix();
  }

  function applyLight(info?: FrameInfo) {
    const lum = info?.lum ?? 0.5;
    renderer.toneMappingExposure = clamp(0.62 + lum * 0.9, 0.72, 1.22);
    scene.environmentIntensity = clamp(0.75 + lum * 0.6, 0.8, 1.25);
    if (info?.tint) {
      const [r, g, b] = info.tint, m = Math.max(r, g, b, 0.05);
      const c = new THREE.Color(0.6 + 0.4 * (r / m), 0.6 + 0.4 * (g / m), 0.6 + 0.4 * (b / m));
      hemi.color.copy(c); key.color.copy(c).lerp(new THREE.Color(1, 1, 1), 0.5);
    }
  }

  function update(t: Tracked | null, w: number, h: number, info?: FrameInfo) {
    last = { t, W: w, H: h, info };
    setMedia(w, h);
    const now = performance.now() / 1000, dt = clamp(now - lastT, 0.001, 0.1); lastT = now;
    const still = !!info?.still;
    holders.forEach((x) => { x.visible = false; });
    if (head) head.visible = false;
    let ok = false;
    if (t && t.kind === "face" && kind === "face") ok = placeFace(t.lms, now, dt, still);
    else if (t && t.kind === "hand" && kind === "hand") ok = placeHand(t, now, still);
    if (!ok) { holders.forEach((x) => { x.visible = false; }); if (head) head.visible = false; if (!t) resetFilters(); }
    applyLight(info);
    aimShadow();
    renderer.render(scene, camera);
    return ok;
  }

  return {
    kind,
    update,
    setFit: (p) => {
      fit = { ...fit, ...p };
      if (last) update(last.t, last.W, last.H, last.info);
    },
    snapshot: () => { renderer.render(scene, camera); return canvas.toDataURL("image/png"); },
    dispose: () => {
      ro.disconnect();
      const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        geos.add(m.geometry);
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x));
      });
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => { Object.values(m).forEach((v) => { if (v instanceof THREE.Texture) v.dispose(); }); m.dispose(); });
      key.shadow.map?.dispose();
      scene.environment?.dispose();
      renderer.dispose();
    },
  };
}

/** Back-compat name used by older code. */
export const createRingAR = createJewelAR;
