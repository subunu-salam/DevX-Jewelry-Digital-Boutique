/**
 * AR try-on renderer — real 3D jewellery composited over the camera / photo.
 *
 * Works in metric camera space (centimetres; camera at the origin looking down −Z) with a
 * perspective camera that matches the back-projection used by the tracker, so a piece
 * lands exactly on the landmark it is anchored to and keeps its true size:
 *
 *  • Earrings — hung from each lobe, gravity-aligned (yaw-only frame) with a slight outward
 *    fan and a damped pendulum sway driven by head motion. An invisible head ellipsoid hides
 *    the far earring as you turn.
 *  • Necklaces — hung from the base of the neck, facing the camera, following head roll a
 *    little. An invisible neck cylinder hides the chain where it goes behind the neck.
 *  • Rings — on the proximal phalanx of the ring finger, sized to the finger, the head on the
 *    back of the hand (flip to wear it palm-side). A finger occluder hides the back of the band.
 *  • Bracelets — just below the wrist crease, sized to the wrist, with a wrist occluder.
 *
 * Jewel models are in millimetres: rings/bangles axis = +Y, head = +Z; earrings and pendants
 * hang from the origin with their face to +Z; necklaces have their origin at the front of
 * the neck base.
 */
import * as THREE from "three";
import { buildJewel, gemMaterial, setMetal as tintMetal, type Jewel } from "./build";
import { makeRenderer, studioEnvironment } from "./stage";
import { isEarring, isNeck, isWrist, type GemKey, type JewelSpec, type Metal } from "./spec";
import { VFOV, clamp, rotAxis, v3, type FaceFrame, type HandFrame, type V } from "@/lib/tryon/math";

export type Region = "ear" | "neck" | "ring" | "wrist";
export const regionOf = (spec: JewelSpec): Region => (isEarring(spec.kind) ? "ear" : isNeck(spec.kind) ? "neck" : isWrist(spec.kind) ? "wrist" : "ring");
export const usesFace = (r: Region) => r === "ear" || r === "neck";

export interface Fit { size: number; height: number; depth: number }
export const DEFAULT_FIT: Fit = { size: 1, height: 0, depth: 0 };

export interface ARFrame {
  W: number; H: number;
  /** seconds since the previous frame */
  dt: number;
  face?: FaceFrame | null;
  hand?: HandFrame | null;
  /** hand: palm faces the camera (from the calibrated sign) */
  palmToCamera?: boolean;
  fit: Fit;
  /** ring: wear the head on the palm side */
  flip: boolean;
  /** scene brightness 0–1 */
  lum: number;
  /** ear-to-ear distance measured by the guided scan (cm) */
  earDist?: number | null;
}

export interface JewelAR {
  readonly region: Region;
  /** Draw one frame; returns true when a piece is on screen. */
  render(f: ARFrame | null): boolean;
  setMetal(m: Metal): void;
  setGem(g: GemKey): void;
  canvas: HTMLCanvasElement;
  dispose(): void;
}

const WORLD_UP: V = [0, 1, 0];
const MM = 0.1; // jewel mm → scene cm

const depthOnly = () => new THREE.MeshBasicMaterial({ colorWrite: false });
const basis = (x: V, y: V, z: V, t: V, s = 1) =>
  new THREE.Matrix4().set(x[0] * s, y[0] * s, z[0] * s, t[0], x[1] * s, y[1] * s, z[1] * s, t[1], x[2] * s, y[2] * s, z[2] * s, t[2], 0, 0, 0, 1);
const scaled = (m: THREE.Matrix4, sx: number, sy: number, sz: number) => m.multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
const fixed = <T extends THREE.Object3D>(o: T) => { o.matrixAutoUpdate = false; o.visible = false; return o; };

export function createJewelAR(canvas: HTMLCanvasElement, spec: JewelSpec, model?: Jewel | null): JewelAR {
  const renderer = makeRenderer(canvas, true);
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  // a soft key light from above-front so metal has a highlight even in flat rooms
  const key = new THREE.DirectionalLight(0xffffff, 0.6); key.position.set(0.3, 1, 0.6); scene.add(key);
  scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  const camera = new THREE.PerspectiveCamera((VFOV * 180) / Math.PI, 1, 2, 600);

  const region = regionOf(spec);
  const base: Jewel = model ?? buildJewel(spec, { wearable: true });
  const count = region === "ear" ? 2 : 1;
  const holders: THREE.Group[] = [];
  for (let i = 0; i < count; i++) {
    const h = fixed(new THREE.Group());
    h.add(i === 0 ? base.group : base.group.clone());
    scene.add(h); holders.push(h);
  }
  // invisible occluders: write depth only, drawn first
  const occ = (geo: THREE.BufferGeometry) => { const m = fixed(new THREE.Mesh(geo, depthOnly())); m.renderOrder = -1; scene.add(m); return m; };
  const head = usesFace(region) ? occ(new THREE.SphereGeometry(1, 28, 18)) : null;
  const limb = region === "ear" ? null : occ(new THREE.CylinderGeometry(1, 1, 1, 32));

  const sway = [0, 1].map(() => ({ a: 0, v: 0, px: null as number | null, pv: 0 }));
  let size = { W: 0, H: 0 };
  const resize = () => renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false);
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  function hide() { holders.forEach((h) => { h.visible = false; }); if (head) head.visible = false; if (limb) limb.visible = false; sway.forEach((s) => { s.px = null; }); }

  function place(o: THREE.Object3D, m: THREE.Matrix4) { o.matrix.copy(m); o.matrixWorldNeedsUpdate = true; o.visible = true; }

  function render(f: ARFrame | null): boolean {
    if (!f) { hide(); renderer.render(scene, camera); return false; }
    if (f.W !== size.W || f.H !== size.H) { size = { W: f.W, H: f.H }; camera.aspect = f.W / f.H; camera.updateProjectionMatrix(); }
    renderer.toneMappingExposure = clamp(0.55 + f.lum, 0.7, 1.25) * 1.05;
    const fit = f.fit;
    let on = false;
    hide();

    if (usesFace(region) && f.face) {
      on = true;
      const fc = f.face;
      const sf = clamp((f.earDist ?? fc.earDist) / 14.2, 0.85, 1.12) * fit.size;
      // head occluder (ellipsoid)
      const hc = v3.madd(v3.madd(fc.earMid, fc.up, 1.4), fc.fwd, -0.4), hr = (fc.earDist / 2) * 0.93;
      place(head!, basis(v3.mul(fc.right, hr), v3.mul(fc.up, 10.6), v3.mul(fc.fwd, 9.6), hc));

      if (region === "ear") {
        for (let side = 0; side < 2; side++) {
          const P = side ? fc.b : fc.a, out = side ? fc.right : v3.mul(fc.right, -1);
          const lobe = v3.madd(v3.madd(v3.madd(P, fc.up, -2.25 + fit.height), fc.fwd, -1.45 - fit.depth * 0.6), out, 0.25);
          // gravity-aligned frame (yaw only), fanned slightly outwards, damped sway
          const fh = rotAxis(WORLD_UP, (side ? 1 : -1) * 0.28)(v3.norm([fc.fwd[0], 0, fc.fwd[2]]));
          const s = sway[side], dt = Math.max(0.008, f.dt);
          if (s.px !== null) {
            const vx = (lobe[0] - s.px) / dt, ax = (vx - s.pv) / dt; s.pv = vx;
            s.v = clamp(s.v + (-ax * 0.0009 - 160 * s.a - 7.5 * s.v) * f.dt, -9, 9);
            s.a = clamp(s.a + s.v * f.dt, -0.45, 0.45);
          }
          s.px = lobe[0];
          const rot = rotAxis(fh, s.a);
          const X = rot(v3.norm(v3.cross(WORLD_UP, fh))), Y = rot(WORLD_UP);
          const m = basis(X, Y, fh, lobe, MM * sf);
          if (side === 1) m.multiply(new THREE.Matrix4().makeScale(-1, 1, 1)); // mirror-image pair
          place(holders[side], m);
        }
      } else {
        const dn = v3.norm(v3.add(v3.mul(fc.up, 0.5), v3.mul(WORLD_UP, 0.5)));
        const centre = v3.madd(v3.madd(fc.earMid, dn, -(12.6 - fit.height * 1.4)), [0, 0, 1], -0.2 + fit.depth * 0.5);
        const rot = rotAxis([0, 0, 1], Math.atan2(fc.right[1], fc.right[0]) * 0.45);
        const X = rot([1, 0, 0]), Y = rot([0, 1, 0]), Z: V = [0, 0, 1];
        // neck occluder (elliptical cylinder along the neck)
        place(limb!, scaled(basis(X, Y, Z, [centre[0], centre[1] - 0.5, centre[2]]), 4.55 * sf, 17, 4.35 * sf));
        // our necklace origin is the front of the neck base
        place(holders[0], basis(X, Y, Z, v3.madd(centre, Z, 4.6 * sf), MM * sf));
      }
    } else if (!usesFace(region) && f.hand) {
      on = true;
      const h = f.hand, pt = h.pts;
      // palm normal pointing out of the palm, then the back-of-hand direction
      let n = h.palmN;
      if ((n[2] > 0) !== !!f.palmToCamera) n = v3.mul(n, -1);
      const dorsal = v3.mul(n, f.flip ? 1 : -1);
      const frame = (axis: V) => {
        const z = v3.norm(v3.sub(dorsal, v3.mul(axis, v3.dot(dorsal, axis))));
        return { x: v3.norm(v3.cross(axis, z)), y: axis, z };
      };
      if (region === "ring") {
        const fingerR = 0.128 * h.span;
        const pos = v3.lerp(pt[13], pt[14], 0.42 + fit.depth * 0.06);
        const b = frame(v3.norm(v3.sub(pt[14], pt[13])));
        const iR = (base.innerR || 8.65) / 10;
        const s = ((fingerR * 1.03) / iR) * fit.size;
        place(limb!, scaled(basis(b.x, b.y, b.z, pos), fingerR * 0.94, 4.5, fingerR * 0.94));
        place(holders[0], basis(b.x, b.y, b.z, pos, MM * s));
      } else {
        const axis = v3.norm(v3.sub(pt[0], pt[9]));
        const pos = v3.madd(pt[0], axis, 1.6 + fit.height * 0.8);
        const b = frame(axis);
        const wristW = 0.84 * h.span;
        const iR = (base.innerR || 29) / 10;
        const s = (((wristW / 2) * 1.04) / iR) * fit.size;
        place(limb!, scaled(basis(b.x, b.y, b.z, pos), (wristW / 2) * 0.92, 11, (wristW / 2) * 0.78));
        place(holders[0], basis(b.x, b.y, b.z, pos, MM * s));
      }
    }
    scene.updateMatrixWorld();
    renderer.render(scene, camera);
    return on;
  }

  return {
    region,
    render,
    canvas,
    setMetal: (m) => tintMetal(base, m),
    setGem: (g) => {
      if (g === "pearl" || !base.centre) return;
      const mat = gemMaterial(g);
      scene.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh && mm.material === base.centre!.material) mm.material = mat; });
      base.centre.material = mat;
    },
    dispose: () => {
      ro.disconnect();
      const seen = new Set<unknown>();
      scene.traverse((o) => {
        const mm = o as THREE.Mesh;
        if (!mm.isMesh) return;
        if (!seen.has(mm.geometry)) { seen.add(mm.geometry); mm.geometry.dispose(); }
        (Array.isArray(mm.material) ? mm.material : [mm.material]).forEach((x) => { if (!seen.has(x)) { seen.add(x); x.dispose(); } });
      });
      scene.environment?.dispose();
      renderer.dispose();
    },
  };
}
