/**
 * Staged backdrops for 3D jewellery — each piece gets a scene that suits it, in the
 * boutique's dark, quiet-luxury palette: a velvet/stone backdrop with a soft overhead
 * spotlight and vignette, a low plinth for the piece to rest on, and a shadow tinted to
 * the scene. The look is chosen from the piece's metal and centre stone, and can be
 * swapped live when the customer changes either in the configurator.
 */
import * as THREE from "three";
import type { GemKey, Metal } from "./spec";

export interface Backdrop {
  /** Name shown to staff/devs; also handy for debugging. */
  name: string;
  /** Backdrop gradient: spotlight centre → mid → edge. */
  light: string; mid: string; edge: string;
  /** Plinth top and side colours. */
  plinth: string; plinthSide: string;
  /** Shadow tint (rgb triplet). */
  shadow: [number, number, number];
  /** Exposure tweak for this scene. */
  exposure: number;
}

const SCENES = {
  espresso: { name: "Espresso velvet", light: "#5a4430", mid: "#2b2018", edge: "#0f0b08", plinth: "#3a2c21", plinthSide: "#1d1610", shadow: [12, 8, 4], exposure: 1.12 },
  midnight: { name: "Midnight slate", light: "#3f4752", mid: "#1d2229", edge: "#0a0c10", plinth: "#2a3038", plinthSide: "#14181d", shadow: [4, 6, 10], exposure: 1.1 },
  mauve: { name: "Dusk mauve", light: "#6a4a4c", mid: "#33232a", edge: "#120c0f", plinth: "#423033", plinthSide: "#21171b", shadow: [14, 6, 8], exposure: 1.1 },
  forest: { name: "Forest velvet", light: "#2f4a3c", mid: "#16261e", edge: "#07100b", plinth: "#20342a", plinthSide: "#0f1a14", shadow: [3, 10, 6], exposure: 1.12 },
  navy: { name: "Sapphire night", light: "#2d3f62", mid: "#141d33", edge: "#060914", plinth: "#1e2a44", plinthSide: "#0e1424", shadow: [3, 5, 14], exposure: 1.12 },
  oxblood: { name: "Oxblood silk", light: "#5e2a2c", mid: "#2c1214", edge: "#0f0606", plinth: "#3b1a1c", plinthSide: "#1d0c0d", shadow: [14, 3, 3], exposure: 1.1 },
  pearl: { name: "Ivory stone", light: "#e9e2d6", mid: "#c9bfae", edge: "#7d7262", plinth: "#d8cfbf", plinthSide: "#a89d8b", shadow: [60, 45, 30], exposure: 1.0 },
} satisfies Record<string, Backdrop>;

export type SceneKey = keyof typeof SCENES;

/** Pick the scene that best flatters a piece. */
export function backdropFor(metal: Metal, gem: GemKey | null): Backdrop {
  if (gem === "emerald") return SCENES.forest;
  if (gem === "sapphire" || gem === "aquamarine") return SCENES.navy;
  if (gem === "ruby") return SCENES.oxblood;
  if (gem === "pearl") return SCENES.pearl;
  if (gem === "morganite" || gem === "amethyst") return SCENES.mauve;
  return metal === "white" ? SCENES.midnight : metal === "rose" ? SCENES.mauve : SCENES.espresso;
}

/** CSS gradient for the same scene — used behind the canvas while 3D loads, so there's no flash. */
export function backdropCss(b: Backdrop) {
  return `radial-gradient(ellipse 70% 55% at 50% 38%, ${b.light} 0%, ${b.mid} 55%, ${b.edge} 100%)`;
}

function backdropTexture(b: Backdrop) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 512;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(256, 190, 10, 256, 230, 380);
  g.addColorStop(0, b.light); g.addColorStop(0.55, b.mid); g.addColorStop(1, b.edge);
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  // fine grain so the gradient reads as fabric/stone rather than a flat digital fill
  const img = x.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 7;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shadowTexture(b: Backdrop) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d")!;
  const [r, g, bl] = b.shadow;
  const gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, `rgba(${r},${g},${bl},0.55)`); gr.addColorStop(0.45, `rgba(${r},${g},${bl},0.18)`); gr.addColorStop(1, `rgba(${r},${g},${bl},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The physical part of the stage: a low round plinth with a soft shadow on it.
 * Returns a group placed so its top surface sits at y = 0.
 */
function plinthGroup(b: Backdrop, radius: number) {
  const g = new THREE.Group();
  const r = radius * 1.35, h = radius * 0.22;
  const top = new THREE.MeshStandardMaterial({ color: b.plinth, roughness: 0.92, metalness: 0 });
  const side = new THREE.MeshStandardMaterial({ color: b.plinthSide, roughness: 0.85, metalness: 0 });
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.02, h, 96, 1), [side, top, side]);
  cyl.position.y = -h / 2;
  g.add(cyl);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.4, radius * 2.4), new THREE.MeshBasicMaterial({ map: shadowTexture(b), transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.001;
  g.add(sh);
  return g;
}

/**
 * Apply a backdrop to a scene. `floorY` is where the piece's lowest point sits.
 * Returns a function that removes/disposes everything it added.
 */
export function applyBackdrop(scene: THREE.Scene, renderer: THREE.WebGLRenderer, b: Backdrop, radius: number, floorY: number) {
  const bg = backdropTexture(b);
  scene.background = bg;
  renderer.toneMappingExposure = b.exposure;
  const stage = plinthGroup(b, radius);
  stage.position.y = floorY;
  scene.add(stage);
  return () => {
    scene.remove(stage);
    stage.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[];
        (Array.isArray(mat) ? mat : [mat]).forEach((x) => { (x as THREE.MeshBasicMaterial).map?.dispose(); x.dispose(); });
      }
    });
    bg.dispose();
  };
}
