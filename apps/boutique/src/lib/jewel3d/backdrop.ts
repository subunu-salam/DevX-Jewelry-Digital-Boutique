/**
 * The jeweller's studio every 3D piece is shown in: a near-black backdrop that lifts to a
 * warm charcoal at the top, a deep vignette and fine film grain; a dark polished floor
 * that gives a faint mirror reflection of the piece; and a soft contact shadow.
 * One consistent stage across the boutique (home, catalogue thumbnails, product viewer).
 */
import * as THREE from "three";
import type { GemKey, Metal } from "./spec";

export interface Backdrop {
  name: string;
  /** Backdrop gradient (sRGB hex): top of frame → bottom of frame. */
  top: string; bot: string;
  /** Vignette centre (0–1, from top-left) and strength (0–1). */
  centre: [number, number]; vignette: number;
  /** Strength of the floor reflection (0–1). */
  reflection: number;
  /** Contact shadow darkness (0–1). */
  shadow: number;
  exposure: number;
}

export const STUDIO: Backdrop = {
  name: "Studio",
  top: "#1b1613", bot: "#050404",
  centre: [0.5, 0.4], vignette: 1,
  reflection: 0.2,
  shadow: 0.35,
  exposure: 1.05,
};

/** Every piece shares the studio; kept as a function so per-piece looks can return later. */
export function backdropFor(_metal?: Metal, _gem?: GemKey | null): Backdrop {
  return STUDIO;
}

/** CSS for the same backdrop — shown behind the canvas while 3D loads, so there's no flash. */
export function backdropCss(b: Backdrop = STUDIO) {
  const [cx, cy] = b.centre;
  return `radial-gradient(ellipse 85% 70% at ${cx * 100}% ${cy * 100}%, transparent 25%, rgba(0,0,0,${0.82 * b.vignette}) 100%), linear-gradient(180deg, ${b.top}, ${b.bot})`;
}

function backdropTexture(b: Backdrop) {
  const W = 512, H = 512;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  const lin = x.createLinearGradient(0, 0, 0, H);
  lin.addColorStop(0, b.top); lin.addColorStop(1, b.bot);
  x.fillStyle = lin; x.fillRect(0, 0, W, H);
  // vignette: darken towards the edges, to ~18% at the corners
  const [cx, cy] = b.centre;
  const v = x.createRadialGradient(cx * W, cy * H, W * 0.12, cx * W, cy * H, W * 0.78);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, `rgba(0,0,0,${0.82 * b.vignette})`);
  x.fillStyle = v; x.fillRect(0, 0, W, H);
  // ±0.5/255 grain so the dark gradient never bands
  const img = x.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = Math.random() < 0.5 ? -1 : 1;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function blobTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.35, "rgba(0,0,0,.55)"); g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A faint mirror image of the piece below the floor line (shares geometry; own faded materials). */
function reflectionOf(subject: THREE.Object3D, floorY: number, strength: number) {
  const mirror = subject.clone(true);
  const made: THREE.Material[] = [];
  mirror.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const fade = (src: THREE.Material) => {
      const mat = src.clone();
      mat.transparent = true;
      mat.opacity = (src.opacity ?? 1) * strength;
      mat.depthWrite = false;
      made.push(mat);
      return mat;
    };
    m.material = Array.isArray(m.material) ? m.material.map(fade) : fade(m.material);
    m.castShadow = false; m.renderOrder = -1;
  });
  // world-space mirror about y = floorY (three.js flips face winding for negative scale)
  const holder = new THREE.Group();
  holder.position.y = 2 * floorY;
  holder.scale.y = -1;
  subject.updateWorldMatrix(true, false);
  mirror.matrixAutoUpdate = false;
  mirror.matrix.copy(subject.matrixWorld);
  holder.add(mirror);
  return { holder, made };
}

/**
 * Apply the studio to a scene. `subject` is the piece (for its reflection), `floorY` the
 * height of its lowest point. Returns a function that removes/disposes what it added.
 */
export function applyBackdrop(scene: THREE.Scene, renderer: THREE.WebGLRenderer, b: Backdrop, radius: number, floorY: number, subject?: THREE.Object3D) {
  const bg = backdropTexture(b);
  scene.background = bg;
  renderer.toneMappingExposure = b.exposure;

  const added: THREE.Object3D[] = [];
  let made: THREE.Material[] = [];
  if (subject && b.reflection > 0) {
    const r = reflectionOf(subject, floorY, b.reflection);
    scene.add(r.holder); added.push(r.holder); made = r.made;
  }
  const blobTex = blobTexture();
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: b.shadow, depthWrite: false });
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.6, radius * 2.6), blobMat);
  blob.rotation.x = -Math.PI / 2; blob.position.y = floorY + radius * 0.002;
  scene.add(blob); added.push(blob);

  return () => {
    added.forEach((o) => scene.remove(o));
    made.forEach((m) => m.dispose());
    blob.geometry.dispose(); blobMat.dispose(); blobTex.dispose(); bg.dispose();
  };
}
