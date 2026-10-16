/**
 * Parametric 3D jewellery (three.js). Units are millimetres.
 * Rings: finger axis = Y, the head (top of the ring) points to +Z.
 * Studs & pendants: face +Z (towards the viewer), up = +Y.
 */
import * as THREE from "three";
import { GEMS, METALS, type GemKey, type JewelSpec, type Metal, type Shape } from "./spec";

/* ───────────── Materials ───────────── */

export function metalMaterial(metal: Metal) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(METALS[metal].color), metalness: 1, roughness: 0.13,
    envMapIntensity: 1.35, clearcoat: 0.35, clearcoatRoughness: 0.08,
  });
}

export function gemMaterial(key: GemKey, small = false) {
  const g = GEMS[key];
  if (key === "pearl") {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#e9dfd6"), roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
      sheen: 1, sheenColor: new THREE.Color("#ffd9e6"), sheenRoughness: 0.35,
      iridescence: 0.8, iridescenceIOR: 1.4, iridescenceThicknessRange: [220, 520], envMapIntensity: 1.7,
    });
  }
  const tint = new THREE.Color(g.color);
  return new THREE.MeshPhysicalMaterial({
    color: key === "diamond" ? new THREE.Color("#ffffff") : tint,
    metalness: 0, roughness: 0, transmission: key === "diamond" ? 0.92 : 0.82, thickness: small ? 0.8 : 3.2, ior: g.ior,
    dispersion: small ? 0 : g.dispersion * 1.4, attenuationColor: tint, attenuationDistance: g.atten,
    specularIntensity: 1, specularColor: new THREE.Color("#ffffff"), envMapIntensity: key === "diamond" ? 5 : 3.2,
    flatShading: true, clearcoat: 1, clearcoatRoughness: 0,
  });
}

/* ───────────── Stones ───────────── */

/** Outline radius at angle t for each cut (unit radius = half the stone width). */
function outline(shape: Shape, t: number): [number, number] {
  const c = Math.cos(t), s = Math.sin(t);
  switch (shape) {
    case "oval": return [c * 1, s * 1.38];
    case "cushion": { const p = 3.2, r = 1 / Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), 1 / p); return [c * r, s * r * 1.08]; }
    case "emerald": { const p = 9, r = 1 / Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), 1 / p); return [c * r * 0.82, s * r * 1.15]; }
    case "pear": { const k = 1 + 0.35 * Math.max(0, s); return [c / k, s * 1.32]; }
    default: return [c, s];
  }
}

/**
 * Brilliant-cut stone: table, star/crown facets, girdle and pavilion to a culet.
 * Built with flat facets so it catches light like a real cut stone. Table faces +Y.
 */
export function stoneGeometry(width: number, shape: Shape = "round", segments = 16) {
  const R = width / 2;
  const crownH = 0.32 * R, pavD = 0.86 * R, girdle = 0.035 * R;
  const ring = (rk: number, y: number, off = 0) => Array.from({ length: segments }, (_, i) => {
    const [x, z] = outline(shape, ((i + off) / segments) * Math.PI * 2);
    return new THREE.Vector3(x * R * rk, y, z * R * rk);
  });
  const table = ring(0.56, crownH), star = ring(0.8, crownH * 0.62, 0.5);
  const gTop = ring(1, girdle), gBot = ring(1, -girdle), pav = ring(0.52, -pavD * 0.42, 0.5);
  const topC = new THREE.Vector3(0, crownH, 0), culet = new THREE.Vector3(0, -pavD, 0);
  const tri: THREE.Vector3[] = [];
  const T = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => tri.push(a, b, c);
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    T(topC, table[j], table[i]);                          // table
    T(table[i], table[j], star[i]);                       // star facets
    T(table[i], star[i], gTop[i]); T(star[i], table[j], gTop[j]); T(star[i], gTop[j], gTop[i]); // kite/upper-girdle
    T(gTop[i], gTop[j], gBot[j]); T(gTop[i], gBot[j], gBot[i]); // girdle
    T(gBot[i], gBot[j], pav[i]); T(pav[i], gBot[j], culet);     // pavilion mains
    T(gBot[i], pav[i], culet);
  }
  const g = new THREE.BufferGeometry().setFromPoints(tri);
  g.computeVertexNormals();
  return g;
}

/* ───────────── Helpers ───────────── */

/** Cylinder between two points (prongs, posts). */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, len, 14), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  const tip = new THREE.Mesh(new THREE.SphereGeometry(r * 0.95, 16, 12), mat);
  tip.position.copy(b);
  const g = new THREE.Group(); g.add(m, tip);
  return g;
}

/** Ring band: comfort-fit profile swept around the Y axis. */
function bandGeometry(innerR: number, width: number, thick: number) {
  const pts: THREE.Vector2[] = [];
  const n = 18;
  for (let i = 0; i <= n; i++) { // outer dome
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    pts.push(new THREE.Vector2(innerR + thick * 0.55 + Math.cos(a) * thick * 0.45, Math.sin(a) * width / 2));
  }
  for (let i = 0; i <= n; i++) { // inner comfort curve
    const a = Math.PI / 2 + (i / n) * Math.PI;
    pts.push(new THREE.Vector2(innerR + thick * 0.18 + Math.cos(a) * thick * 0.18, Math.sin(a) * width / 2 * 0.98));
  }
  pts.push(pts[0].clone());
  return new THREE.LatheGeometry(pts, 160);
}

export interface Jewel {
  group: THREE.Group;
  metal: THREE.MeshPhysicalMaterial;
  centre: THREE.Mesh | null;
  accents: THREE.Mesh[];
  /** for try-on: inner radius of rings/bangles (mm) */
  innerR: number;
}

/** Build the piece described by `spec`. */
export function buildJewel(spec: JewelSpec): Jewel {
  const group = new THREE.Group();
  const metal = metalMaterial(spec.metal);
  const accents: THREE.Mesh[] = [];
  let centre: THREE.Mesh | null = null;
  const accentMat = gemMaterial("diamond", true);
  const W = spec.stoneMm;
  const [, depthK] = outline(spec.shape, Math.PI / 2); // length/width ratio
  const smallStone = (w: number) => new THREE.Mesh(stoneGeometry(w, "round", 8), accentMat);

  /** Centre stone (or pearl) + its setting, table facing +Y, girdle at y=0. */
  const head = (withHalo: boolean) => {
    const h = new THREE.Group();
    if (spec.gem === "pearl") {
      centre = new THREE.Mesh(new THREE.SphereGeometry(W / 2, 48, 32), gemMaterial("pearl"));
      centre.position.y = W * 0.12; h.add(centre);
      const cup = new THREE.Mesh(new THREE.SphereGeometry(W * 0.22, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), metal);
      cup.position.y = -W * 0.08; h.add(cup);
    }
    else if (spec.gem) {
      centre = new THREE.Mesh(stoneGeometry(W, spec.shape, 24), gemMaterial(spec.gem));
      h.add(centre);
      // prongs: 4 for round/cushion/emerald, 6 for oval/pear look elegant too
      const n = spec.shape === "oval" || spec.shape === "pear" ? 6 : 4;
      for (let i = 0; i < n; i++) {
        const a = ((i + 0.5) / n) * Math.PI * 2;
        const [x, z] = outline(spec.shape, a);
        const top = new THREE.Vector3(x * W * 0.5, W * 0.1, z * W * 0.5);
        const base = new THREE.Vector3(x * W * 0.3, -W * 0.46, z * W * 0.3);
        h.add(rod(base, top, W * 0.055, metal));
      }
      // gallery rail under the girdle
      const rail = new THREE.Mesh(new THREE.TorusGeometry(W * 0.36, W * 0.035, 10, 48), metal);
      rail.rotation.x = Math.PI / 2; rail.scale.y = depthK; rail.position.y = -W * 0.26; h.add(rail);
    }
    if (withHalo && spec.gem) {
      const haloR = W * 0.5 + (spec.gem === "pearl" ? 0.5 : 0.85), sw = 1.25;
      const ringM = new THREE.Mesh(new THREE.TorusGeometry(haloR, 0.62, 12, 72), metal);
      ringM.rotation.x = Math.PI / 2; ringM.scale.y = depthK; ringM.position.y = -0.55; h.add(ringM);
      const count = Math.max(12, Math.round((Math.PI * 2 * haloR * (1 + depthK) / 2) / (sw * 1.05)));
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const s = smallStone(sw);
        s.position.set(Math.cos(a) * haloR, -0.15, Math.sin(a) * haloR * depthK);
        h.add(s); accents.push(s);
      }
    }
    return h;
  };

  let innerR = 0;
  if (spec.kind === "ring") {
    innerR = 8.6; // ≈ size O / 17.2 mm
    const thick = 1.7, width = spec.style === "plain" ? 3.5 : 2.1;
    const band = new THREE.Mesh(bandGeometry(innerR, width, thick), metal);
    group.add(band);
    const outerR = innerR + thick;
    if (spec.style === "pave" || spec.style === "halo-pave") {
      const sw = 1.3, step = (sw * 1.12) / outerR;
      for (let a = 0.24; a < 1.35; a += step) for (const sgn of [-1, 1]) {
        const s = smallStone(sw);
        s.position.set(Math.sin(a * sgn) * (outerR - 0.12), 0, Math.cos(a * sgn) * (outerR - 0.12));
        s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.sin(a * sgn), 0, Math.cos(a * sgn)));
        group.add(s); accents.push(s);
      }
    }
    if (spec.gem) {
      const h = head(spec.style === "halo" || spec.style === "halo-pave");
      h.rotation.x = Math.PI / 2;                 // table faces +Z (up from the finger)
      h.position.z = outerR + W * 0.44;
      group.add(h);
      // shoulders that lift the setting off the band
      for (const sgn of [-1, 1]) {
        const s = rod(new THREE.Vector3(sgn * 1.5, 0, outerR - 0.4), new THREE.Vector3(sgn * 1.0, 0, outerR + W * 0.2), 0.55, metal);
        group.add(s);
      }
    }
  } else if (spec.kind === "stud") {
    const h = head(spec.style === "halo" || spec.style === "halo-pave");
    h.rotation.x = Math.PI / 2; // face the viewer
    group.add(h);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 10, 12), metal);
    post.rotation.x = Math.PI / 2; post.position.z = -5.5; group.add(post);
  } else if (spec.kind === "pendant") {
    const h = head(true);
    h.rotation.x = Math.PI / 2;
    group.add(h);
    const top = W * depthK * 0.5 + (spec.gem ? 2.2 : 0.5);
    const bail = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.45, 12, 32), metal);
    bail.position.set(0, top + 1.4, -0.4); group.add(bail);
    // fine chain sweeping up out of frame
    for (const sgn of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, top + 2.6, -0.4), new THREE.Vector3(sgn * 3.5, top + 8, -0.8), new THREE.Vector3(sgn * 7, top + 18, -1.4)]);
      const chain = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.42, 8), metal);
      chain.userData.chain = true; group.add(chain);
    }
  } else {
    innerR = 29;
    const band = new THREE.Mesh(bandGeometry(innerR, 5, 3), metal);
    group.add(band);
    if (spec.gem) {
      const sw = 2.2, outer = innerR + 3, step = (sw * 1.1) / outer;
      for (let a = 0; a < Math.PI * 2 - step / 2; a += step) {
        const s = new THREE.Mesh(stoneGeometry(sw, "round", 8), gemMaterial(spec.gem === "pearl" ? "diamond" : spec.gem, true));
        s.position.set(Math.sin(a) * (outer - 0.2), 0, Math.cos(a) * (outer - 0.2));
        s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.sin(a), 0, Math.cos(a)));
        group.add(s); accents.push(s);
      }
    }
  }
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });
  return { group, metal, centre, accents, innerR };
}

/** Swap the metal colour in place (configurator). */
export function setMetal(j: Jewel, metal: Metal) { j.metal.color.set(METALS[metal].color); }
/** Swap the centre gem in place (configurator). */
export function setGem(j: Jewel, gem: GemKey) {
  if (!j.centre || gem === "pearl") return;
  const old = j.centre.material as THREE.Material;
  j.centre.material = gemMaterial(gem);
  old.dispose();
}

/** Showcase pose for the viewer: rings stand upright with the stone on top, studs/pendants face the camera. */
export function showcasePose(j: Jewel, kind: JewelSpec["kind"]) {
  if (kind === "ring") j.group.rotation.set(-Math.PI / 2 + 0.42, 0, 0); // head (+Z) → up (+Y), finger axis towards camera
  else if (kind === "bangle") j.group.rotation.set(0.5, 0, 0);
  else j.group.rotation.set(0, 0, 0);
}
