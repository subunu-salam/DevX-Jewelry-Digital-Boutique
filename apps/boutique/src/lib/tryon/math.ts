/**
 * Metric tracking maths for the live 3D try-on.
 *
 * Camera space, in CENTIMETRES: camera at the origin looking down −Z, +Y up, +X right
 * (un-mirrored image). Landmarks are lifted into 3D with a pinhole model:
 *   • Face — absolute depth from the human iris (11.7 mm, nearly constant across adults),
 *     so earrings and necklaces keep their real size at any distance.
 *   • Hand — depth from MediaPipe's metric world landmarks vs. their pixel lengths.
 * Every signal is smoothed with One-Euro filters (steady when still, responsive when moving),
 * orientation with a quaternion One-Euro.
 *
 * Pure functions, no three.js / DOM — unit-testable in Node.
 */
export type V = [number, number, number];
export type Quat = [number, number, number, number]; // x, y, z, w
export interface Lm { x: number; y: number; z: number }

export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** Vertical field of view assumed for webcams / phone selfies. Projection and back-projection share it. */
export const VFOV = (55 * Math.PI) / 180;
export const IRIS_CM = 1.17;
export const focalPx = (H: number) => H / 2 / Math.tan(VFOV / 2);

/* ── vectors ── */
export const v3 = {
  add: (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a: V, s: number): V => [a[0] * s, a[1] * s, a[2] * s],
  madd: (a: V, b: V, s: number): V => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
  dot: (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a: V) => Math.hypot(a[0], a[1], a[2]),
  norm: (a: V): V => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  dist: (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
};

/** Rodrigues rotation about `axis` by `ang` radians. */
export function rotAxis(axis: V, ang: number) {
  const [x, y, z] = v3.norm(axis), c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  return (p: V): V => [
    (t * x * x + c) * p[0] + (t * x * y - s * z) * p[1] + (t * x * z + s * y) * p[2],
    (t * x * y + s * z) * p[0] + (t * y * y + c) * p[1] + (t * y * z - s * x) * p[2],
    (t * x * z - s * y) * p[0] + (t * y * z + s * x) * p[1] + (t * z * z + c) * p[2],
  ];
}

/* ── quaternions (row-major 3×3 in / out) ── */
type M3 = [V, V, V];
export const Q = {
  norm(q: Quat): Quat { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; },
  dot: (a: Quat, b: Quat) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3],
  angle(a: Quat, b: Quat) { return 2 * Math.acos(clamp(Math.abs(Q.dot(a, b)), 0, 1)); },
  fromMat3(r: M3): Quat {
    const [[m00, m01, m02], [m10, m11, m12], [m20, m21, m22]] = r;
    const tr = m00 + m11 + m22; let x: number, y: number, z: number, w: number;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
    else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
    else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
    else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
    return Q.norm([x, y, z, w]);
  },
  toMat3([x, y, z, w]: Quat): M3 {
    return [
      [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ];
  },
  slerp(a: Quat, b: Quat, t: number): Quat {
    let d = Q.dot(a, b); if (d < 0) { b = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }
    if (d > 0.9995) return Q.norm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]);
    const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb, a[3] * wa + b[3] * wb];
  },
};

/* ── One-Euro filters (Casiez et al. 2012); time in ms ── */
const alpha = (cut: number, dt: number) => { const tau = 1 / (TAU * cut); return 1 / (1 + tau / dt); };
export class OneEuro {
  private x: number | null = null; private dx = 0; private t: number | null = null;
  constructor(private mc = 1.2, private beta = 0.02, private dc = 1.0) {}
  reset() { this.x = null; this.t = null; this.dx = 0; }
  filter(v: number, t: number) {
    if (this.x === null || this.t === null) { this.x = v; this.t = t; this.dx = 0; return v; }
    const dt = Math.max(1e-3, Math.min(0.25, (t - this.t) / 1000)); this.t = t;
    const dv = (v - this.x) / dt;
    this.dx += alpha(this.dc, dt) * (dv - this.dx);
    this.x += alpha(this.mc + this.beta * Math.abs(this.dx), dt) * (v - this.x);
    return this.x;
  }
}
export class OneEuroV {
  private f: OneEuro[];
  constructor(mc: number, beta: number, dc = 1) { this.f = [0, 1, 2].map(() => new OneEuro(mc, beta, dc)); }
  reset() { this.f.forEach((f) => f.reset()); }
  filter(a: V, t: number): V { return [this.f[0].filter(a[0], t), this.f[1].filter(a[1], t), this.f[2].filter(a[2], t)]; }
}
export class OneEuroQuat {
  private q: Quat | null = null; private t = 0; private speed = 0;
  constructor(private mc = 1.0, private beta = 0.05) {}
  reset() { this.q = null; }
  filter(q: Quat, t: number): Quat {
    if (!this.q) { this.q = q; this.t = t; return q; }
    if (Q.dot(this.q, q) < 0) q = [-q[0], -q[1], -q[2], -q[3]];
    const dt = Math.max(1e-3, Math.min(0.25, (t - this.t) / 1000)); this.t = t;
    this.speed += alpha(1, dt) * (Q.angle(this.q, q) / dt - this.speed);
    this.q = Q.slerp(this.q, q, alpha(this.mc + this.beta * this.speed, dt));
    return this.q;
  }
}

/* ── Face ── */
export interface FaceFrame {
  /** distance of the eyes from the camera (cm) */
  Z: number;
  iris: number;
  right: V; up: V; fwd: V;
  /** viewer-left / viewer-right ear contour points (landmarks 234 / 454) */
  a: V; b: V;
  earMid: V; earDist: number;
  chin: V; top: V;
}

/** Landmark → camera-space point (cm). `Z` is the metric depth of the reference landmarks. */
export function backproject(lm: Lm, W: number, H: number, f: number, Z: number, zRef: number): V {
  const Zi = Math.max(5, Z + ((lm.z - zRef) * W * Z) / f);
  return [((lm.x * W - W / 2) / f) * Zi, (-(lm.y * H - H / 2) / f) * Zi, -Zi];
}

/** Metric head frame from 478 face-mesh landmarks (needs the iris landmarks 468–477). */
export function faceFrame3D(lm: Lm[], W: number, H: number): FaceFrame | null {
  if (lm.length < 478) return null;
  const f = focalPx(H);
  const d = (i: number, j: number) => Math.hypot((lm[i].x - lm[j].x) * W, (lm[i].y - lm[j].y) * H);
  const iris = (Math.max(d(469, 471), d(470, 472)) + Math.max(d(474, 476), d(475, 477))) / 2;
  if (!(iris > 1.5)) return null;
  const Z = (f * IRIS_CM) / iris;
  if (Z < 12 || Z > 260) return null;
  const zRef = (lm[468].z + lm[473].z) / 2;
  const P = (i: number) => backproject(lm[i], W, H, f, Z, zRef);
  let a = P(234), b = P(454);
  if (a[0] > b[0]) [a, b] = [b, a];
  const right = v3.norm(v3.sub(b, a));
  const top = P(10), chin = P(152);
  let up = v3.norm(v3.sub(top, chin));
  const fwd = v3.norm(v3.cross(right, up));
  up = v3.norm(v3.cross(fwd, right));
  return { Z, iris, right, up, fwd, a, b, earMid: v3.lerp(a, b, 0.5), earDist: v3.dist(a, b), chin, top };
}

/** Head yaw / pitch in degrees (0 = facing the camera). Positive yaw = turned to the viewer's right. */
export const headAngles = (f: { fwd: V }) => ({
  yaw: (Math.atan2(f.fwd[0], f.fwd[2]) * 180) / Math.PI,
  pitch: (Math.asin(clamp(f.fwd[1], -1, 1)) * 180) / Math.PI,
});

export class FaceSmoother {
  private pos = new OneEuroV(1.4, 0.03); private a = new OneEuroV(1.6, 0.04); private b = new OneEuroV(1.6, 0.04);
  private chin = new OneEuroV(1.4, 0.03); private q = new OneEuroQuat(1.1, 0.06); private z = new OneEuro(0.8, 0.01);
  reset() { [this.pos, this.a, this.b, this.chin, this.q, this.z].forEach((f) => f.reset()); }
  filter(fr: FaceFrame, t: number): FaceFrame {
    const R: M3 = [[fr.right[0], fr.up[0], fr.fwd[0]], [fr.right[1], fr.up[1], fr.fwd[1]], [fr.right[2], fr.up[2], fr.fwd[2]]];
    const m = Q.toMat3(this.q.filter(Q.fromMat3(R), t));
    return {
      ...fr,
      a: this.a.filter(fr.a, t), b: this.b.filter(fr.b, t), earMid: this.pos.filter(fr.earMid, t), chin: this.chin.filter(fr.chin, t),
      right: [m[0][0], m[1][0], m[2][0]], up: [m[0][1], m[1][1], m[2][1]], fwd: [m[0][2], m[1][2], m[2][2]],
      earDist: this.z.filter(fr.earDist, t),
    };
  }
}

/* ── Hand ── */
export interface HandFrame {
  /** 21 smoothed camera-space points (cm) */
  pts: V[];
  Z: number;
  /** index-knuckle to little-knuckle distance (cm) */
  span: number;
  /** 2D winding of wrist→index→little knuckles; its sign tells palm vs back (after calibration) */
  cross2d: number;
  /** un-signed palm normal */
  palmN: V;
  label: "Left" | "Right";
}

const BONES: [number, number][] = [[0, 5], [0, 17], [5, 9], [9, 13], [13, 17], [5, 17], [0, 9], [0, 13]];

/** Metric hand from image landmarks + MediaPipe world landmarks (metres). */
export function handFrame3D(lm: Lm[], wl: Lm[], W: number, H: number, filters: OneEuroV[] | null, t: number, label: "Left" | "Right"): HandFrame | null {
  if (lm.length < 21 || wl.length < 21) return null;
  const f = focalPx(H);
  const px = (i: number) => [lm[i].x * W, lm[i].y * H];
  const wd = (i: number): V => [wl[i].x, -wl[i].y, -wl[i].z];
  const span2 = Math.hypot(px(5)[0] - px(17)[0], px(5)[1] - px(17)[1]);
  const spanW = v3.dist(wd(5), wd(17)) * 100;
  if (span2 < 6 || spanW < 3) return null;
  let sp = 0, sw = 0;
  for (const [a, b] of BONES) { sp += Math.hypot(px(a)[0] - px(b)[0], px(a)[1] - px(b)[1]); sw += v3.dist(wd(a), wd(b)) * 100; }
  const Z = Math.max(12, (f * sw) / Math.max(1, sp));
  const zRef = (wl[0].z + wl[5].z + wl[17].z) / 3;
  const P = (i: number): V => { const Zi = Z + (wl[i].z - zRef) * 100; return [((lm[i].x * W - W / 2) / f) * Zi, (-(lm[i].y * H - H / 2) / f) * Zi, -Zi]; };
  const cross2d = (px(5)[0] - px(0)[0]) * (px(17)[1] - px(0)[1]) - (px(5)[1] - px(0)[1]) * (px(17)[0] - px(0)[0]);
  const pts: V[] = [];
  for (let i = 0; i < 21; i++) pts.push(filters ? filters[i].filter(P(i), t) : P(i));
  const palmN = v3.norm(v3.cross(v3.sub(pts[5], pts[0]), v3.sub(pts[17], pts[0])));
  return { pts, Z, span: v3.dist(pts[5], pts[17]), cross2d, palmN, label };
}
export const handFilters = () => Array.from({ length: 21 }, () => new OneEuroV(1.8, 0.05));

/** Palm-side calibration: the sign of cross2d when the palm faces the camera, per hand. */
export class HandSign {
  private s: Partial<Record<"Left" | "Right", number>> = {};
  calibratePalm(h: HandFrame) {
    const other = h.label === "Left" ? "Right" : "Left";
    this.s[h.label] = h.cross2d >= 0 ? 1 : -1; this.s[other] = -this.s[h.label]!;
  }
  sign(h: HandFrame) { return this.s[h.label] ?? (h.label === "Left" ? -1 : 1); }
  /** true when the palm faces the camera */
  palmToCamera(h: HandFrame) { return h.cross2d * this.sign(h) > 0; }
}
