/**
 * Still "product photography" of 3D jewellery: renders a piece once, on its staged
 * backdrop, into an image URL. Uses one shared offscreen renderer for every still, so
 * the home page can show several pieces without opening several WebGL contexts.
 */
import * as THREE from "three";
import { buildJewel, showcasePose, type Jewel } from "./build";
import { centre, makeRenderer, studioEnvironment } from "./stage";
import { applyBackdrop, backdropFor } from "./backdrop";
import type { JewelSpec } from "./spec";

let shared: { renderer: THREE.WebGLRenderer; env: THREE.Texture } | null = null;
let queue: Promise<unknown> = Promise.resolve();

function stage() {
  if (!shared) {
    const canvas = document.createElement("canvas");
    const renderer = makeRenderer(canvas);
    renderer.setPixelRatio(1);
    shared = { renderer, env: studioEnvironment(renderer) };
  }
  return shared;
}

/**
 * Render a portrait still of the piece. `aspect` is width / height of the frame it will fill.
 * Calls are queued so they share one renderer safely.
 */
export function renderStill(spec: JewelSpec, opts: { jewel?: Jewel; aspect?: number; height?: number } = {}): Promise<string> {
  const job = queue.then(() => draw(spec, opts));
  queue = job.catch(() => undefined);
  return job;
}

function draw(spec: JewelSpec, { jewel: given, aspect = 2 / 3, height = 900 }: { jewel?: Jewel; aspect?: number; height?: number }): string {
  const { renderer, env } = stage();
  const w = Math.round(height * aspect), h = height;
  renderer.setSize(w, h, false);

  const scene = new THREE.Scene();
  scene.environment = env;
  const jewel = given ?? buildJewel(spec);
  showcasePose(jewel, spec.kind);
  const radius = centre(jewel.group);
  scene.add(jewel.group);
  const floorY = new THREE.Box3().setFromObject(jewel.group).min.y;
  const clear = applyBackdrop(scene, renderer, backdropFor(spec.metal, spec.gem), radius, floorY, jewel.group);

  // A slightly raised three-quarter view with the piece a little above centre, leaving
  // room below for its reflection on the studio floor.
  const camera = new THREE.PerspectiveCamera(28, w / h, radius * 0.05, radius * 40);
  const dist = radius * (aspect < 0.6 ? 5.4 : aspect < 0.9 ? 4.6 : 3.9);
  camera.position.set(radius * 0.55, radius * 1.0, dist);
  camera.lookAt(0, -radius * 0.35, 0);

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/jpeg", 0.9);

  clear();
  scene.remove(jewel.group);
  jewel.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.geometry.dispose(); const mat = m.material as THREE.Material | THREE.Material[]; (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose()); }
  });
  return url;
}
