/**
 * Parametric 3D jewellery (three.js). Units are millimetres.
 * Rings: finger axis = Y, the head (top of the ring) points to +Z.
 * Studs & pendants: face +Z (towards the viewer), up = +Y.
 */
import * as THREE from "three";
import { GEMS, METALS, isEarring, isNeck, type GemKey, type JewelSpec, type Metal, type Shape } from "./spec";

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
  if (small) {
    // Melee stones are too small for refraction to read — a bright, mirror-faceted finish looks right.
    return new THREE.MeshPhysicalMaterial({
      color: key === "diamond" ? new THREE.Color("#f4f8ff") : tint, metalness: key === "diamond" ? 0.35 : 0.1, roughness: 0.02,
      ior: g.ior, specularIntensity: 1, envMapIntensity: key === "diamond" ? 4.5 : 3, clearcoat: 1, clearcoatRoughness: 0, flatShading: true,
    });
  }
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

/**
 * Necklace path in front view (XY, facing +Z), origin at the base of the neck between the
 * two sides of the chain. The ends sweep back (−Z) around the neck.
 */
export function neckCurve(depth: number, halfWidth = 58) {
  const hw = halfWidth;
  // The chain carries on round the back of the neck (hidden by the neck occluder in try-on),
  // so it reads as one continuous loop from every angle.
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(-hw * 0.3, 5, -86), new THREE.Vector3(-hw * 0.7, 4, -70),
    new THREE.Vector3(-hw * 0.92, 2, -24), new THREE.Vector3(-hw, -depth * 0.18, -10),
    new THREE.Vector3(-hw * 0.82, -depth * 0.62, -2), new THREE.Vector3(-hw * 0.42, -depth * 0.94, 0),
    new THREE.Vector3(0, -depth, 0.5),
    new THREE.Vector3(hw * 0.42, -depth * 0.94, 0), new THREE.Vector3(hw * 0.82, -depth * 0.62, -2),
    new THREE.Vector3(hw, -depth * 0.18, -10), new THREE.Vector3(hw * 0.92, 2, -24),
    new THREE.Vector3(hw * 0.7, 4, -70), new THREE.Vector3(hw * 0.3, 5, -86),
  ], false, "centripetal");
}

/** Real chain: interlocking oval links along a curve (instanced, so long chains stay fast). */
export function chainAlong(curve: THREE.Curve<THREE.Vector3>, mat: THREE.Material, link = 1) {
  const len = curve.getLength(), pitch = link * 1.55;
  const n = Math.max(2, Math.floor(len / pitch));
  const geo = new THREE.TorusGeometry(link, link * 0.26, 8, 20);
  geo.scale(1.45, 1, 1);
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), twist = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, p = curve.getPointAt(t), tan = curve.getTangentAt(t).normalize();
    q.setFromUnitVectors(X, tan);
    twist.setFromAxisAngle(tan, i % 2 ? Math.PI / 2 : 0);
    m.compose(p, twist.multiply(q), new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m);
  }
  mesh.castShadow = true;
  return mesh;
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
export function buildJewel(spec: JewelSpec, opts: { wearable?: boolean } = {}): Jewel {
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
    if (spec.motif === "evil-eye") {
      // enamel eye in a gold bezel (table up = +Y)
      const disc = (r: number, y: number, color: string, ry = 0.18) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 16), new THREE.MeshPhysicalMaterial({ color, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.4 }));
        m.scale.set(1, ry, 1); m.position.y = y; return m;
      };
      h.add(disc(W * 0.5, 0, "#1d3f9e"), disc(W * 0.36, 0.25, "#f4f6fb"), disc(W * 0.24, 0.45, "#3d8ee8"), disc(W * 0.12, 0.62, "#0c0d12"));
      const bez = new THREE.Mesh(new THREE.TorusGeometry(W * 0.52, 0.55, 14, 64), metal);
      bez.rotation.x = Math.PI / 2; h.add(bez);
      return h;
    }
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
      if (spec.style === "trilogy") {
        // two side stones, 60% of the centre, each in its own 4-prong basket
        for (const sgn of [-1, 1]) {
          const sw = W * 0.6;
          const side = new THREE.Group();
          const st = new THREE.Mesh(stoneGeometry(sw, spec.shape, 16), gemMaterial(spec.gem));
          side.add(st); accents.push(st);
          for (let i = 0; i < 4; i++) {
            const a = ((i + 0.5) / 4) * Math.PI * 2, [x, z] = outline(spec.shape, a);
            side.add(rod(new THREE.Vector3(x * sw * 0.3, -sw * 0.46, z * sw * 0.3), new THREE.Vector3(x * sw * 0.5, sw * 0.1, z * sw * 0.5), sw * 0.06, metal));
          }
          side.rotation.x = Math.PI / 2;
          const ang = sgn * (W * 0.5 + sw * 0.55) / (outerR + W * 0.3);
          side.position.set(Math.sin(ang) * (outerR + sw * 0.4), 0, Math.cos(ang) * (outerR + sw * 0.4));
          side.rotateY(ang);
          group.add(side);
        }
      }
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
  } else if (spec.kind === "drop" && spec.motif === "jhumka") {
    // jhumka: domed stud top, then a bell with bead fringe
    const top = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), metal);
    top.rotation.x = Math.PI / 2; group.add(top);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 10, 12), metal);
    post.rotation.x = Math.PI / 2; post.position.z = -5.5; group.add(post);
    group.add(chainAlong(new THREE.LineCurve3(new THREE.Vector3(0, -3.5, 0), new THREE.Vector3(0, -8, 0)), metal, 0.6));
    const prof = [new THREE.Vector2(0.01, 0), new THREE.Vector2(1.2, -0.3), new THREE.Vector2(3.6, -3), new THREE.Vector2(6.2, -8), new THREE.Vector2(8.4, -12.5), new THREE.Vector2(8.8, -13.4), new THREE.Vector2(7.9, -13.2)];
    const bell = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), metal);
    bell.position.y = -8.5; group.add(bell);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 10), metal);
      bead.position.set(Math.cos(a) * 8.4, -8.5 - 14.6, Math.sin(a) * 8.4); group.add(bead);
    }
    for (let i = 0; i < 18; i++) { // filigree dots on the bell
      const a = (i / 18) * Math.PI * 2;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), metal);
      dot.position.set(Math.cos(a) * 6.6, -8.5 - 9, Math.sin(a) * 6.6); group.add(dot);
    }
  } else if (spec.kind === "drop") {
    // small stud at the lobe (origin), a few links, then the drop stone hanging below
    const top = new THREE.Mesh(stoneGeometry(3.2, "round", 12), accentMat);
    top.rotation.x = Math.PI / 2; group.add(top); accents.push(top);
    const cup = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.35, 10, 28), metal); group.add(cup);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 10, 12), metal);
    post.rotation.x = Math.PI / 2; post.position.z = -5.5; group.add(post);
    const drop = spec.gem === "pearl" ? 0 : W * depthK * 0.5;
    const linkLen = 9;
    group.add(chainAlong(new THREE.LineCurve3(new THREE.Vector3(0, -2, 0), new THREE.Vector3(0, -2 - linkLen, 0)), metal, 0.7));
    const h = head(spec.style === "halo" || spec.style === "halo-pave");
    h.rotation.x = Math.PI / 2;
    h.position.y = -2 - linkLen - (spec.gem === "pearl" ? W / 2 : drop) - 1.2;
    group.add(h);
  } else if (spec.kind === "hoop") {
    const R = 9.5;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(R, 1.15, 20, 96), metal);
    hoop.position.y = -R; group.add(hoop);
    if (spec.gem) {
      for (let a = -Math.PI * 0.85; a <= -Math.PI * 0.15; a += 0.16) {
        const sx = Math.cos(a) * R, sy = Math.sin(a) * R - R;
        const st = new THREE.Mesh(stoneGeometry(1.4, "round", 8), accentMat);
        st.rotation.x = Math.PI / 2; st.position.set(sx, sy, 1.0); group.add(st); accents.push(st);
      }
    }
  } else if (isNeck(spec.kind)) {
    const depth = spec.kind === "choker" ? 26 : spec.kind === "riviere" ? 58 : spec.kind === "pearlStrand" ? 66 : 82;
    const curve = neckCurve(depth);
    const full = opts.wearable || spec.kind !== "pendant";
    if (spec.kind === "pendant") {
      const h = head(true);
      h.rotation.x = Math.PI / 2;
      const top = W * depthK * 0.5 + (spec.gem ? 2.2 : 0.5);
      const bailY = full ? -depth - 1.5 : top + 1.4;
      const bail = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.45, 12, 32), metal);
      bail.position.set(0, bailY, 0.2); group.add(bail);
      h.position.y = full ? bailY - 1.5 - top : 0;
      group.add(h);
      if (full) group.add(chainAlong(curve, metal, 0.55));
      else for (const sgn of [-1, 1]) {
        const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, top + 2.6, -0.4), new THREE.Vector3(sgn * 3.5, top + 8, -0.8), new THREE.Vector3(sgn * 7, top + 18, -1.4)]);
        group.add(chainAlong(c, metal, 0.55));
      }
    } else if (spec.kind === "chain") {
      group.add(chainAlong(curve, metal, 1.1));
    } else if (spec.kind === "pearlStrand") {
      const n = Math.floor(curve.getLength() / (W * 1.04));
      const pearls = new THREE.InstancedMesh(new THREE.SphereGeometry(W / 2, 32, 20), gemMaterial("pearl"), n);
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) { const pt = curve.getPointAt((i + 0.5) / n); m.makeTranslation(pt.x, pt.y, pt.z); pearls.setMatrixAt(i, m); }
      group.add(pearls);
    } else if (spec.kind === "riviere" || spec.kind === "choker") {
      if (spec.kind === "choker") group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 2.2, 14), metal));
      const L = curve.getLength();
      let u = 0;
      const gemKey = spec.gem && spec.gem !== "pearl" ? spec.gem : "diamond";
      while (u < L) {
        const t = u / L, mid = 1 - Math.abs(t - 0.5) * 2; // graduated: larger at the front
        const sw = spec.kind === "choker" ? 2.6 : 2.6 + mid * mid * 3;
        const pt = curve.getPointAt(Math.min(1, t));
        const col = new THREE.Mesh(new THREE.CylinderGeometry(sw * 0.56, sw * 0.42, sw * 0.5, 20), metal);
        const lift = spec.kind === "choker" ? 2.3 : 0; // sit on top of the choker band
        col.rotation.x = Math.PI / 2; col.position.set(pt.x, pt.y, pt.z - sw * 0.1 + lift); group.add(col);
        const st = new THREE.Mesh(stoneGeometry(sw, "round", sw > 4 ? 16 : 10), gemMaterial(gemKey, sw < 4));
        st.rotation.x = Math.PI / 2; st.position.set(pt.x, pt.y, pt.z + sw * 0.12 + lift); group.add(st); accents.push(st);
        u += sw * 1.08;
      }
    }
  } else {
    // bracelets — axis along Y like a ring
    innerR = 29;
    if (spec.kind === "bangle") {
      group.add(new THREE.Mesh(bandGeometry(innerR, 5, 3), metal));
      if (spec.gem) {
        const sw = 2.2, outer = innerR + 3, step = (sw * 1.1) / outer;
        for (let a = 0; a < Math.PI * 2 - step / 2; a += step) {
          const st = new THREE.Mesh(stoneGeometry(sw, "round", 8), gemMaterial(spec.gem === "pearl" ? "diamond" : spec.gem, true));
          st.position.set(Math.sin(a) * (outer - 0.2), 0, Math.cos(a) * (outer - 0.2));
          st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.sin(a), 0, Math.cos(a)));
          group.add(st); accents.push(st);
        }
      }
    } else {
      const R = innerR + 1.8;
      const loop = new THREE.CatmullRomCurve3(Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * Math.PI * 2; return new THREE.Vector3(Math.sin(a) * R, 0, Math.cos(a) * R); }), true);
      if (spec.kind === "linkBracelet") group.add(chainAlong(loop, metal, 2.2));
      else {
        const sw = 3, n = Math.floor((Math.PI * 2 * R) / (sw * 1.12));
        const gemKey = spec.gem && spec.gem !== "pearl" ? spec.gem : "diamond";
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2, out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
          const col = new THREE.Mesh(new THREE.BoxGeometry(sw * 1.02, sw * 1.02, 1.8), metal);
          col.position.copy(out.clone().multiplyScalar(R)); col.lookAt(out.clone().multiplyScalar(R * 2)); group.add(col);
          const st = new THREE.Mesh(stoneGeometry(sw * 0.92, "round", 12), gemMaterial(gemKey, true));
          st.position.copy(out.clone().multiplyScalar(R + 1.05));
          st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out);
          group.add(st); accents.push(st);
        }
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
  if (gem === "pearl") return;
  if (j.centre) {
    const old = j.centre.material as THREE.Material;
    j.centre.material = gemMaterial(gem);
    old.dispose();
  } else if (j.accents.length) {
    // rivière / tennis pieces: every stone is the "gem"
    const mat = gemMaterial(gem, true);
    j.accents.forEach((a) => { a.material = mat; });
  }
}

/** Showcase pose for the viewer: rings stand upright with the stone on top, studs/pendants face the camera. */
export function showcasePose(j: Jewel, kind: JewelSpec["kind"]) {
  if (kind === "ring") j.group.rotation.set(-Math.PI / 2 + 0.42, 0, 0); // head (+Z) → up (+Y), finger axis towards camera
  else if (kind === "bangle" || kind === "tennis" || kind === "linkBracelet") j.group.rotation.set(0.55, 0, 0.12);
  else if (isNeck(kind) && kind !== "pendant") j.group.rotation.set(-0.28, 0, 0);
  else if (isEarring(kind)) j.group.rotation.set(0, kind === "hoop" ? 0.35 : 0, 0);
  else j.group.rotation.set(0, 0, 0);
}
