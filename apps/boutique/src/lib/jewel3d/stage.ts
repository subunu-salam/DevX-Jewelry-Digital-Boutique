/**
 * Studio stage for 3D jewellery: physically-based renderer, a jewellery-photography
 * environment (soft boxes + bright strips for sparkle), a soft contact shadow and helpers
 * to frame the piece.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export function makeRenderer(canvas: HTMLCanvasElement, transparent = false) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.outputColorSpace = THREE.SRGBColorSpace;
  if (transparent) r.setClearColor(0x000000, 0);
  return r;
}

/** Jewellery lighting: a white room plus long bright strips that put fire in the stones. */
export function studioEnvironment(renderer: THREE.WebGLRenderer) {
  const env = new RoomEnvironment();
  const strip = (w: number, h: number, x: number, y: number, z: number, ry: number, intensity: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.y = ry; m.lookAt(0, 0, 0);
    env.add(m);
  };
  strip(0.6, 9, -6, 2, 3, 0, 9);
  strip(0.6, 9, 6, 2, 3, 0, 9);
  strip(9, 0.6, 0, 7, -2, 0, 7);
  strip(2, 2, 0, -4, 6, 0, 4);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  env.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
  return tex;
}

/** Soft radial contact shadow (cheap, always looks clean). */
export function contactShadow(size: number) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(60,45,30,0.30)"); g.addColorStop(0.4, "rgba(60,45,30,0.10)"); g.addColorStop(1, "rgba(40,30,20,0)");
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** Put the object's centre at the origin and return its bounding radius. */
export function centre(obj: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.sub(c);
  return box.getBoundingSphere(new THREE.Sphere()).radius;
}
