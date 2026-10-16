/**
 * Interactive 3D jewellery viewer (framework-free so it can be lazy-loaded):
 * orbit/zoom, auto-rotate, live metal & gem swaps, snapshot. Pauses when off-screen.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildJewel, setGem, setMetal, showcasePose, type Jewel } from "./build";
import { centre, contactShadow, makeRenderer, studioEnvironment } from "./stage";
import type { GemKey, JewelSpec, Metal } from "./spec";

export interface Viewer {
  setMetal(m: Metal): void;
  setGem(g: GemKey): void;
  setAutoRotate(on: boolean): void;
  reset(): void;
  snapshot(): string;
  dispose(): void;
}

export function createViewer(canvas: HTMLCanvasElement, spec: JewelSpec, opts: { background?: string; jewel?: Jewel } = {}): Viewer {
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(opts.background ?? "#f6f4f1");
  scene.environment = studioEnvironment(renderer);

  const jewel: Jewel = opts.jewel ?? buildJewel(spec);
  showcasePose(jewel, spec.kind);
  const holder = new THREE.Group();
  holder.add(jewel.group);
  const radius = centre(jewel.group);
  scene.add(holder);
  const shadow = contactShadow(radius * 2.2);
  shadow.position.y = -radius * 0.92;
  scene.add(shadow);

  const camera = new THREE.PerspectiveCamera(30, 1, radius * 0.05, radius * 40);
  const home = new THREE.Vector3(radius * 0.9, radius * 0.6, radius * 3.3);
  camera.position.copy(home);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = radius * 1.6; controls.maxDistance = radius * 6;
  controls.autoRotate = true; controls.autoRotateSpeed = 1.6;
  controls.target.set(0, 0, 0);
  controls.addEventListener("start", () => { controls.autoRotate = false; });

  const resize = () => {
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
  let visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(canvas);

  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    controls.update();
    renderer.render(scene, camera);
  };
  loop();

  return {
    setMetal: (m) => setMetal(jewel, m),
    setGem: (g) => setGem(jewel, g),
    setAutoRotate: (on) => { controls.autoRotate = on; },
    reset: () => { camera.position.copy(home); controls.target.set(0, 0, 0); controls.autoRotate = true; },
    snapshot: () => { renderer.render(scene, camera); return canvas.toDataURL("image/png"); },
    dispose: () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) { m.geometry.dispose(); const mat = m.material as THREE.Material | THREE.Material[]; (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose()); }
      });
      scene.environment?.dispose();
      renderer.dispose();
    },
  };
}
