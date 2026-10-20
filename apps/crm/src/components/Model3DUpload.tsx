import { useEffect, useState } from "react";
import { Box, Loader2, Trash2, Upload } from "lucide-react";
import { API_URL, getToken } from "@/lib/api";
import { Button, Field, Input, Modal, Select } from "@/components/ui";

export interface Model3DProduct { id: string; name: string; sku: string; category: string | null; model3d?: string | null }

/** Reads a .glb header + JSON chunk: mesh count and what made it — enough for a sanity check before upload. */
async function inspectGlb(f: File) {
  const buf = await f.arrayBuffer();
  const dv = new DataView(buf);
  if (buf.byteLength < 20 || new TextDecoder().decode(new Uint8Array(buf, 0, 4)) !== "glTF") throw new Error("This isn't a binary glTF (.glb) file. Export as .glb from Rhino, Matrix, Blender or iJewel.");
  const len = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, len)));
  const mats: { name?: string; extensions?: Record<string, unknown> }[] = json.materials ?? [];
  const gems = mats.filter((m) => "WEBGI_materials_diamond" in (m.extensions ?? {}) || /gem|diamond|stone/i.test(m.name ?? "")).length;
  return { buf, meshes: (json.meshes ?? []).length as number, gems, generator: (json.asset?.generator as string) ?? "unknown" };
}

/** CRM: attach a real 3D model to a product — used by the shop's "View in 3D" and 3D try-on. */
export default function Model3DUpload({ product, onClose, onSaved }: { product: Model3DProduct | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<{ buf: ArrayBuffer; meshes: number; gems: number; generator: string } | null>(null);
  const [piece, setPiece] = useState("0");
  const [mm, setMm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isRing = /ring/i.test(product?.category ?? "") && !/earring/i.test(product?.category ?? "");
  const isBangle = /bangle|bracelet|kada/i.test(product?.category ?? "");

  useEffect(() => { setFile(null); setInfo(null); setPiece("0"); setMm(isRing ? "17.3" : isBangle ? "58" : ""); setErr(null); }, [product?.id, isRing, isBangle]);

  async function pick(f: File | null) {
    setFile(f); setInfo(null); setErr(null);
    if (!f) return;
    if (f.size > 40 * 1024 * 1024) { setErr("File is over 40 MB — reduce the polygon count or texture size and export again."); return; }
    try { setInfo(await inspectGlb(f)); } catch (e) { setErr((e as Error).message); }
  }

  async function upload() {
    if (!product || !file || !info) return;
    setBusy(true); setErr(null);
    try {
      const q = new URLSearchParams({ fileName: file.name, piece, source: "upload" });
      if (mm) q.set("mm", mm);
      const res = await fetch(`${API_URL}/api/crm/products/${product.id}/model3d?${q}`, {
        method: "PUT", body: info.buf,
        headers: { "Content-Type": "model/gltf-binary", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Upload failed (${res.status})`);
      onSaved(`3D model added to ${product.name} — it now shows in "View in 3D" and the 3D try-on`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function remove() {
    if (!product) return;
    setBusy(true);
    try {
      await fetch(`${API_URL}/api/crm/products/${product.id}/model3d`, { method: "DELETE", headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} });
      onSaved(`3D model removed — ${product.name} uses the generated 3D piece again`);
    } finally { setBusy(false); }
  }

  return (
    <Modal open={!!product} onClose={onClose} title={`3D model · ${product?.name ?? ""}`}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Upload the piece's CAD model as a <b>.glb</b> (Rhino, Matrix, Blender, iJewel). Stones are detected and given a diamond finish,
          the metal gets the product's colour, and rings are sized to the finger automatically.
        </p>
        <a href={`${import.meta.env.VITE_BOUTIQUE_URL ?? "http://localhost:5173"}/ai/photo-to-3d?product=${product?.id ?? ""}`} target="_blank" rel="noopener"
          className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5 text-sm hover:bg-primary/10">
          <span><b>No CAD file?</b> Make the 3D model from a photo — cut-out, vector outline and 3D build, published straight to this piece.</span>
          <span className="ml-3 shrink-0 font-semibold text-primary">Photo → 3D ↗</span>
        </a>
        {product?.model3d && (
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm">
            <span className="inline-flex items-center gap-2"><Box className="size-4 text-primary" /> A 3D model is live for this piece</span>
            <div className="flex gap-2">
              <a className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted" href={`${API_URL}${product.model3d}`} download>Download</a>
              <button onClick={remove} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-danger hover:bg-muted"><Trash2 className="size-3.5" /> Remove</button>
            </div>
          </div>
        )}
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-8 text-sm hover:bg-muted/40">
          <Upload className="size-5 text-muted-foreground" />
          {file ? <span className="font-medium">{file.name} · {(file.size / 1048576).toFixed(1)} MB</span> : <span>Choose a .glb file</span>}
          <input type="file" accept=".glb,model/gltf-binary" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        </label>
        {info && (
          <p className="text-xs text-muted-foreground">
            {info.meshes} parts · {info.gems ? `${info.gems} stone material${info.gems > 1 ? "s" : ""} found` : "no stone materials found (metal only)"} · made with {info.generator}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Piece in the file">
            <Select value={piece} onChange={setPiece}>
              {[0, 1, 2, 3].map((i) => <option key={i} value={i}>{i === 0 ? "1st (largest)" : `${i + 1}${["", "nd", "rd", "th"][i]}`} piece</option>)}
            </Select>
          </Field>
          <Field label={isRing ? "Ring inner diameter (mm)" : isBangle ? "Bangle inner diameter (mm)" : "Piece length (mm, optional)"}>
            <Input value={mm} onChange={setMm} placeholder={isRing ? "17.3" : isBangle ? "58" : "e.g. 30"} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">Files with several pieces (e.g. a bridal set) are split automatically — pick which one this product is.</p>
        {err && <p className="text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={upload} disabled={!info || busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload 3D model</Button>
        </div>
      </div>
    </Modal>
  );
}
