/**
 * Uploaded 3D models (.glb from Rhino/Matrix/iJewel/Blender…) → the same `Jewel` shape the
 * viewer and AR use, so a real CAD model drops straight into "View in 3D" and the try-on.
 *
 *  • Bakes every mesh into one coordinate space and splits the file into pieces
 *    (a file with two rings becomes two rings).
 *  • Re-materials: stones (iJewel "diamond" materials, or names like gem/diamond/stone) get our
 *    refractive gem finish; everything else gets our polished metal. Proprietary viewer
 *    materials don't survive outside their own viewer, so this is what makes them sparkle here.
 *  • Rings: finds the finger axis (thinnest side), the head (where the stones are) and the inner
 *    diameter, then re-orients to our convention (axis = Y, head = +Z) and scales to true size.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { gemMaterial, metalMaterial, type Jewel } from "./build";
import type { JewelKind, Metal } from "./spec";

export interface CustomOpts {
  kind: JewelKind;
  metal?: Metal;
  /** ring: inner diameter in mm (default 17.3 ≈ US 7 / IN 14) */
  innerMm?: number;
  /** other pieces: longest side in mm */
  sizeMm?: number;
}

const isGemMat = (m: THREE.Material) => {
  const ext = (m.userData?.gltfExtensions ?? {}) as Record<string, unknown>;
  return "WEBGI_materials_diamond" in ext || /gem|diamond|stone|ruby|sapphire|emerald/i.test(m.name || "")
    || ((m as THREE.MeshPhysicalMaterial).transmission ?? 0) > 0.3;
};

interface Part { geo: THREE.BufferGeometry; gem: boolean; box: THREE.Box3 }

/** Group parts that physically touch into separate pieces (voxel contact, so crossed or
 *  nested display arrangements still split correctly). */
function splitPieces(parts: Part[]): Part[][] {
  const diag = parts.reduce((b, p) => b.union(p.box), new THREE.Box3()).getSize(new THREE.Vector3()).length();
  const cell = diag * 0.006;
  const id = parts.map((_, i) => i);
  const find = (i: number): number => (id[i] === i ? i : (id[i] = find(id[i])));
  const owner = new Map<string, number>();
  const v = new THREE.Vector3();
  parts.forEach((p, i) => {
    const pos = p.geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      const key = `${Math.floor(v.x / cell)},${Math.floor(v.y / cell)},${Math.floor(v.z / cell)}`;
      const o = owner.get(key);
      if (o === undefined) owner.set(key, i); else if (find(o) !== find(i)) id[find(o)] = find(i);
    }
  });
  const groups = new Map<number, Part[]>();
  parts.forEach((p, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), p]); });
  // main pieces = ones with metal that are a decent size; loose stones/bits join the nearest one
  const boxOf = (g: Part[]) => g.reduce((b, p) => b.union(p.box), new THREE.Box3());
  const all = [...groups.values()];
  const sizeOf = (g: Part[]) => boxOf(g).getSize(new THREE.Vector3()).length();
  const maxSize = Math.max(...all.map(sizeOf));
  const main = all.filter((g) => g.some((p) => !p.gem) && sizeOf(g) > maxSize * 0.45);
  for (const g of all) {
    if (main.includes(g)) continue;
    const c = boxOf(g).getCenter(new THREE.Vector3());
    let best = main[0], bd = Infinity;
    for (const m of main) { const d = boxOf(m).distanceToPoint(c); if (d < bd) { bd = d; best = m; } }
    best.push(...g);
  }
  return main;
}

function toJewel(parts: Part[], o: CustomOpts): Jewel {
  const box = parts.reduce((b, p) => b.union(p.box), new THREE.Box3());
  const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const dims = [size.x, size.y, size.z];
  const unit = (i: number) => new THREE.Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0);
  const comp = (v: THREE.Vector3, i: number) => (i === 0 ? v.x : i === 1 ? v.y : v.z);
  const matrix = new THREE.Matrix4();
  let innerR = 0;

  if (o.kind === "ring") {
    const ax = dims.indexOf(Math.min(...dims));
    const [a, b] = [0, 1, 2].filter((i) => i !== ax);
    const headDim = dims[a] >= dims[b] ? a : b, sideDim = headDim === a ? b : a;
    const outerD = dims[sideDim];
    // head direction: where the stones sit (or the heavier side for a plain band)
    const gemC = new THREE.Vector3(); let n = 0;
    parts.filter((p) => p.gem).forEach((p) => { gemC.add(p.box.getCenter(new THREE.Vector3())); n++; });
    const sign = n ? Math.sign(comp(gemC.divideScalar(n), headDim) - comp(mid, headDim)) || 1 : 1;
    const lo = comp(box.min, headDim), hi = comp(box.max, headDim);
    const centre = mid.clone();
    centre.setComponent(headDim, sign > 0 ? lo + outerD / 2 : hi - outerD / 2);
    // inner radius: closest metal vertices to the axis in the middle slab of the band
    const ds: number[] = [];
    const v = new THREE.Vector3(), axisV = unit(ax), half = dims[ax] * 0.25;
    for (const p of parts) {
      if (p.gem) continue;
      const pos = p.geo.attributes.position;
      for (let i = 0; i < pos.count; i += 3) {
        v.fromBufferAttribute(pos, i).sub(centre);
        if (Math.abs(v.dot(axisV)) > half) continue;
        const d = v.clone().addScaledVector(axisV, -v.dot(axisV)).length();
        if (d > outerD * 0.2) ds.push(d);
      }
    }
    ds.sort((x, y) => x - y);
    const rawInner = ds.length ? ds[Math.floor(ds.length * 0.03)] : outerD * 0.42;
    const k = (o.innerMm ?? 17.3) / 2 / rawInner;
    innerR = rawInner * k;
    // basis: file axis → Y, head → Z
    const X = new THREE.Vector3().crossVectors(axisV, unit(headDim).multiplyScalar(sign));
    const basis = new THREE.Matrix4().makeBasis(X, axisV, unit(headDim).multiplyScalar(sign)).invert();
    matrix.makeScale(k, k, k).multiply(basis).multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z));
  } else {
    const k = (o.sizeMm ?? (o.kind === "stud" ? 8 : o.kind === "pendant" ? 18 : 30)) / Math.max(...dims);
    matrix.makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-mid.x, -mid.y, -mid.z));
  }

  const group = new THREE.Group();
  const metal = metalMaterial(o.metal ?? "white");
  const accents: THREE.Mesh[] = [];
  let centreStone: THREE.Mesh | null = null, biggest = 0;
  const small = gemMaterial("diamond", true);
  for (const p of parts) {
    const geo = p.geo.clone().applyMatrix4(matrix);
    geo.computeBoundingBox();
    const s = geo.boundingBox!.getSize(new THREE.Vector3()).length();
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, p.gem ? (s > 4 ? gemMaterial("diamond") : small) : metal);
    mesh.castShadow = true;
    group.add(mesh);
    if (p.gem) { accents.push(mesh); if (s > 4 && s > biggest) { biggest = s; centreStone = mesh; } }
  }
  if (centreStone) accents.splice(accents.indexOf(centreStone), 1);
  return { group, metal, centre: centreStone, accents, innerR };
}

/** Load a .glb/.gltf and return one Jewel per piece in the file. */
export async function loadJewelModel(url: string, o: CustomOpts): Promise<Jewel[]> {
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const parts: Part[] = [];
  gltf.scene.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
    geo.computeBoundingBox();
    parts.push({ geo, gem: mats.some(isGemMat), box: geo.boundingBox!.clone() });
  });
  if (!parts.length) throw new Error("No meshes in this file");
  const pieces = splitPieces(parts);
  // largest piece first
  pieces.sort((x, y) => y.length - x.length);
  return pieces.map((p) => toJewel(p, o));
}

/** The product's uploaded model ("/api/public/models/:id?piece=&mm=") as a ready Jewel, or null. */
export async function loadProductModel(url: string, apiBase: string, spec: { kind: JewelKind; metal: Metal }): Promise<Jewel | null> {
  const q = new URL(url, "http://x").searchParams;
  const pieces = await loadJewelModel(url.startsWith("/") ? apiBase + url : url, {
    kind: spec.kind, metal: spec.metal,
    innerMm: spec.kind === "ring" ? Number(q.get("mm")) || undefined : undefined,
    sizeMm: spec.kind !== "ring" ? Number(q.get("mm")) || undefined : undefined,
  });
  return pieces[Math.min(Number(q.get("piece")) || 0, pieces.length - 1)] ?? null;
}
