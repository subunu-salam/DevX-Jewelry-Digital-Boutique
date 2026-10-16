/**
 * AR try-on with real 3D jewellery, for every category:
 *
 *  • Rings & bracelets — MediaPipe hand landmarks. Ring on the proximal phalanx of the ring
 *    finger, bracelets just below the wrist crease; axis along the finger/forearm in 3D, head
 *    out of the back of the hand; true size from the knuckle span; an invisible finger/wrist
 *    occluder hides the back of the band.
 *  • Earrings — face landmarks. One 3D earring per lobe, true size from the iris, tilted with
 *    the head (roll), turned with it (yaw), the far one hidden as the head turns away.
 *  • Necklaces — body (pose) landmarks. Hung from the base of the neck, sized from shoulder
 *    width (or head size when shoulders are out of frame); an invisible neck occluder hides the
 *    part of the chain that goes behind the neck.
 */
import * as THREE from "three";
import { buildJewel, type Jewel } from "./build";
import { makeRenderer, studioEnvironment } from "./stage";
import { isEarring, isNeck, isWrist, type JewelSpec } from "./spec";

interface Lm { x: number; y: number; z?: number; visibility?: number }
const KNUCKLES_MM = 70, IRIS_MM = 11.7, FACE_MM = 140, SHOULDERS_MM = 360, EARS_MM = 150;

export interface JewelAR {
  /** Feed the latest landmarks (normalised MediaPipe output) and the media size in pixels. */
  update(lms: Lm[] | null, W: number, H: number): void;
  snapshot(): string;
  dispose(): void;
}
export type RingAR = JewelAR;

const depthOnly = () => new THREE.MeshBasicMaterial({ colorWrite: false });

/** Smoothed rigid transform (position, rotation, uniform scale). */
class Pose {
  pos = new THREE.Vector3(); quat = new THREE.Quaternion(); scale = 1; has = false;
  set(p: THREE.Vector3, q: THREE.Quaternion, s: number, k = 0.42) {
    if (!this.has) { this.pos.copy(p); this.quat.copy(q); this.scale = s; this.has = true; return; }
    this.pos.lerp(p, k); this.quat.slerp(q, k * 0.9); this.scale += (s - this.scale) * k * 0.8;
  }
  apply(o: THREE.Object3D) { o.position.copy(this.pos); o.quaternion.copy(this.quat); o.scale.setScalar(this.scale); }
}

export function createJewelAR(canvas: HTMLCanvasElement, spec: JewelSpec): JewelAR {
  const renderer = makeRenderer(canvas, true);
  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -20000, 20000);
  camera.position.z = 10000;

  const ear = isEarring(spec.kind), neck = isNeck(spec.kind), wrist = isWrist(spec.kind);
  const holders: THREE.Group[] = [];
  const poses: Pose[] = [];
  const jewels: Jewel[] = [];
  const count = ear ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const j = buildJewel(spec, { wearable: true });
    const h = new THREE.Group();
    h.add(j.group);
    if (!ear && !neck) {
      // finger / wrist occluder along the jewel's axis (Y)
      const r = j.innerR * 0.98;
      const occ = new THREE.Mesh(new THREE.CylinderGeometry(r, r, wrist ? 160 : 60, 40), depthOnly());
      occ.renderOrder = -1; h.add(occ);
    }
    if (neck) {
      // neck occluder: hides the chain where it goes round the back of the neck
      const occ = new THREE.Mesh(new THREE.CylinderGeometry(52, 56, 150, 40), depthOnly());
      occ.position.set(0, 60, -34); occ.renderOrder = -1; h.add(occ);
    }
    h.visible = false;
    scene.add(h); holders.push(h); poses.push(new Pose()); jewels.push(j);
  }

  let size = { W: 0, H: 0 };
  const resize = () => renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false);
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
  const hideAll = () => holders.forEach((h) => { h.visible = false; });

  function update(lms: Lm[] | null, W: number, H: number) {
    if (W !== size.W || H !== size.H) {
      size = { W, H };
      camera.left = 0; camera.right = W; camera.top = 0; camera.bottom = -H; camera.updateProjectionMatrix();
    }
    const need = ear ? 468 : neck ? 13 : 21;
    if (!lms || lms.length < need) { hideAll(); renderer.render(scene, camera); poses.forEach((p) => { p.has = false; }); return; }
    // landmark → world (pixels; y up; z towards the camera)
    const P = (i: number) => new THREE.Vector3(lms[i].x * W, -lms[i].y * H, -(lms[i].z ?? 0) * W);
    const P2 = (i: number) => new THREE.Vector2(lms[i].x * W, lms[i].y * H);

    if (ear) {
      const eyeL = P2(33), eyeR = P2(263), top = P2(10), chin = P2(152), sideL = P2(234), sideR = P2(454), nose = P2(1);
      const roll = Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x);
      const down = new THREE.Vector2(-Math.sin(roll), Math.cos(roll));
      const faceH = top.distanceTo(chin), faceW = sideL.distanceTo(sideR);
      const iris = lms.length >= 478 ? (P2(469).distanceTo(P2(471)) + P2(474).distanceTo(P2(476))) / 2 : 0;
      const pxPerMm = iris > 2 ? iris / IRIS_MM : faceW / FACE_MM;
      const rL = nose.distanceTo(sideL), rR = nose.distanceTo(sideR), tot = rL + rR || 1;
      const yaw = (rL / tot - 0.5) * 2.2; // ≈ radians of head turn
      [sideL, sideR].forEach((side, i) => {
        const lobe = side.clone().addScaledVector(down, faceH * 0.2);
        const share = (i === 0 ? rL : rR) / tot;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, -roll, "YXZ"));
        poses[i].set(new THREE.Vector3(lobe.x, -lobe.y, 0), q, pxPerMm);
        poses[i].apply(holders[i]);
        holders[i].visible = share > 0.27; // far ear turns behind the face
      });
    } else if (neck) {
      const sL = P2(11), sR = P2(12), mouth = P2(9).add(P2(10)).multiplyScalar(0.5);
      const seen = (i: number) => (lms[i].visibility ?? 1) > 0.55 && lms[i].y < 1.02;
      const flat = (a: THREE.Vector2, b: THREE.Vector2) => { let r = Math.atan2(b.y - a.y, b.x - a.x); if (r > Math.PI / 2) r -= Math.PI; if (r < -Math.PI / 2) r += Math.PI; return r; };
      let base: THREE.Vector2, pxPerMm: number, roll: number;
      if (seen(11) && seen(12)) {
        const mid = sL.clone().add(sR).multiplyScalar(0.5);
        base = mid.clone().lerp(mouth, 0.24); pxPerMm = sL.distanceTo(sR) / SHOULDERS_MM; roll = flat(sL, sR);
      } else {
        roll = flat(P2(2), P2(5));
        const earW = P2(7).distanceTo(P2(8));
        base = mouth.clone().addScaledVector(new THREE.Vector2(-Math.sin(roll), Math.cos(roll)), earW * 0.95);
        pxPerMm = earW / EARS_MM;
      }
      poses[0].set(new THREE.Vector3(base.x, -base.y, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -roll)), pxPerMm);
      poses[0].apply(holders[0]);
      holders[0].visible = true;
    } else {
      const wristP = P(0), k5 = P(5), k9 = P(9), k13 = P(13), j14 = P(14), k17 = P(17);
      const pxPerMm = Math.hypot(k5.x - k17.x, k5.y - k17.y) / KNUCKLES_MM;
      let at: THREE.Vector3, axis: THREE.Vector3;
      if (wrist) {
        axis = k9.clone().sub(wristP).normalize();
        at = wristP.clone().addScaledVector(axis, -wristP.distanceTo(k9) * 0.12);
      } else {
        at = k13.clone().lerp(j14, 0.36);
        axis = j14.clone().sub(k13).normalize();
      }
      const n = new THREE.Vector3().crossVectors(k5.clone().sub(k17), k9.clone().sub(wristP)).normalize();
      if (n.z < 0) n.negate();
      const up = n.sub(axis.clone().multiplyScalar(n.dot(axis))).normalize();
      const x = new THREE.Vector3().crossVectors(axis, up).normalize();
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, axis, up));
      poses[0].set(at, q, pxPerMm);
      poses[0].apply(holders[0]);
      holders[0].visible = true;
    }
    renderer.render(scene, camera);
  }

  return {
    update,
    snapshot: () => { renderer.render(scene, camera); return canvas.toDataURL("image/png"); },
    dispose: () => {
      ro.disconnect();
      scene.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.geometry.dispose(); const mat = mm.material as THREE.Material | THREE.Material[]; (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose()); } });
      scene.environment?.dispose();
      renderer.dispose();
    },
  };
}

/** Back-compat name used by the try-on page. */
export const createRingAR = createJewelAR;
