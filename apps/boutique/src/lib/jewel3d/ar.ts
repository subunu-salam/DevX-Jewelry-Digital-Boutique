/**
 * AR ring try-on: places the 3D ring on the ring finger from MediaPipe hand landmarks.
 *
 *  • Position — on the proximal phalanx of the ring finger (between knuckle 13 and joint 14)
 *  • Orientation — ring axis along the finger (3D, using landmark depth); the head points out
 *    of the back of the hand
 *  • True size — millimetres → pixels from the knuckle span (≈70 mm adult average)
 *  • Occlusion — an invisible "finger" cylinder writes depth so the back of the band
 *    disappears behind the finger, like a real ring
 */
import * as THREE from "three";
import { buildJewel, type Jewel } from "./build";
import { makeRenderer, studioEnvironment } from "./stage";
import type { JewelSpec } from "./spec";

interface Lm { x: number; y: number; z?: number }
const KNUCKLES_MM = 70;

export interface RingAR {
  /** Feed the latest landmarks (normalised, MediaPipe hand) and the media size in pixels. */
  update(lms: Lm[] | null, W: number, H: number): void;
  /** Render once more (e.g. after a still photo) and return a PNG data URL of the overlay. */
  snapshot(): string;
  dispose(): void;
}

export function createRingAR(canvas: HTMLCanvasElement, spec: JewelSpec): RingAR {
  const renderer = makeRenderer(canvas, true);
  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10000, 10000);
  camera.position.z = 5000;

  const jewel: Jewel = buildJewel({ ...spec, kind: spec.kind === "bangle" ? "bangle" : "ring" });
  const holder = new THREE.Group();
  holder.add(jewel.group);
  // Finger occluder: depth only, rendered first.
  const occR = jewel.innerR * 0.98;
  const occ = new THREE.Mesh(new THREE.CylinderGeometry(occR, occR, spec.kind === "bangle" ? 140 : 60, 40), new THREE.MeshBasicMaterial({ colorWrite: false }));
  occ.renderOrder = -1;
  holder.add(occ);
  holder.visible = false;
  scene.add(holder);

  let size = { W: 0, H: 0 };
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion();
  let scale = 1, has = false;

  const resize = () => {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
  };
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  function update(lms: Lm[] | null, W: number, H: number) {
    if (W !== size.W || H !== size.H) {
      size = { W, H };
      camera.left = 0; camera.right = W; camera.top = 0; camera.bottom = -H; camera.updateProjectionMatrix();
    }
    if (!lms || lms.length < 21) { holder.visible = false; renderer.render(scene, camera); has = false; return; }
    // landmark → world (pixels; y up; z towards the camera)
    const P = (i: number) => new THREE.Vector3(lms[i].x * W, -lms[i].y * H, -(lms[i].z ?? 0) * W);
    const wrist = P(0), k5 = P(5), k9 = P(9), k13 = P(13), j14 = P(14), k17 = P(17);
    const pxPerMm = Math.hypot(k5.x - k17.x, k5.y - k17.y) / KNUCKLES_MM;

    let at: THREE.Vector3, axis: THREE.Vector3;
    if (spec.kind === "bangle") {
      const dir = k9.clone().sub(wrist).normalize();
      at = wrist.clone().addScaledVector(dir, -wrist.distanceTo(k9) * 0.12);
      axis = dir;
    } else {
      at = k13.clone().lerp(j14, 0.36);
      axis = j14.clone().sub(k13).normalize();
    }
    // Back-of-hand normal (pointing towards the camera when the back of the hand is shown).
    const across = k5.clone().sub(k17), along = k9.clone().sub(wrist);
    const n = new THREE.Vector3().crossVectors(across, along).normalize();
    if (n.z < 0) n.negate();
    const up = n.sub(axis.clone().multiplyScalar(n.dot(axis))).normalize();   // ring head direction (+Z model)
    const x = new THREE.Vector3().crossVectors(axis, up).normalize();          // +X = Y × Z
    const m = new THREE.Matrix4().makeBasis(x, axis, up);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);

    // smooth (lerp/slerp): steady but responsive
    if (!has) { pos.copy(at); quat.copy(q); scale = pxPerMm; has = true; }
    else { pos.lerp(at, 0.45); quat.slerp(q, 0.4); scale += (pxPerMm - scale) * 0.35; }
    holder.position.copy(pos);
    holder.quaternion.copy(quat);
    holder.scale.setScalar(scale);
    holder.visible = true;
    renderer.render(scene, camera);
  }

  return {
    update,
    snapshot: () => { renderer.render(scene, camera); return canvas.toDataURL("image/png"); },
    dispose: () => {
      ro.disconnect();
      scene.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.geometry.dispose(); (mm.material as THREE.Material).dispose(); } });
      scene.environment?.dispose();
      renderer.dispose();
    },
  };
}
