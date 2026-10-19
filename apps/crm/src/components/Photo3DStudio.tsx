import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Check, ImageUp, Loader2, PenTool, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { API_URL, api, getToken } from "@/lib/api";
import { Button, Field, Input, Modal, Select } from "@/components/ui";
import { aiMask, applyMask, autoMask, loadImage, toWorking } from "@/lib/cutout";
import {
  DEFAULT_MM, analyse, buildParametric, buildRelief, exportGlb, vectorize,
  type Analysis, type GemKey, type JewelKind, type JewelSpec, type Metal, type Shape, type Style, type Vectors,
} from "@/lib/photo3d";
import { GEMS, METALS, isEarring, isNeck, isWrist, specFromProduct } from "@jewel3d/spec";
import type { Viewer } from "@jewel3d/viewer";

export interface Photo3DProduct { id: string; name: string; sku: string; category: string | null; image: string | null; model3d?: string | null }

type Method = "relief" | "parametric" | "ai";
const KINDS: { k: JewelKind; label: string }[] = [
  { k: "ring", label: "Ring" }, { k: "stud", label: "Stud earrings" }, { k: "drop", label: "Drop earrings" }, { k: "hoop", label: "Hoop earrings" },
  { k: "pendant", label: "Pendant" }, { k: "riviere", label: "Rivière / tennis necklace" }, { k: "choker", label: "Choker" }, { k: "chain", label: "Chain necklace" },
  { k: "pearlStrand", label: "Pearl strand" }, { k: "bangle", label: "Bangle" }, { k: "tennis", label: "Tennis bracelet" }, { k: "linkBracelet", label: "Link bracelet" },
];
const round = (k: JewelKind) => k === "ring" || isWrist(k);

/**
 * CRM: turn a photo of a piece into a 3D model for the shop's "View in 3D" and 3D try-on.
 *   photo → background removed → outline traced to vectors → 3D (relief / parametric / AI) → publish
 */
export default function Photo3DStudio({ product, onClose, onSaved }: { product: Photo3DProduct | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null);
  const [mask, setMask] = useState<HTMLCanvasElement | null>(null);
  const [cut, setCut] = useState<HTMLCanvasElement | null>(null);
  const [vec, setVec] = useState<Vectors | null>(null);
  const [info, setInfo] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const guess = useMemo(() => (product ? specFromProduct({ name: product.name, category: product.category ?? "" }) : null), [product]);
  const [kind, setKind] = useState<JewelKind>("pendant");
  const [method, setMethod] = useState<Method>("relief");
  const [sizeMm, setSizeMm] = useState("26");
  const [innerMm, setInnerMm] = useState("17.3");
  const [metal, setMetal] = useState<Metal>("yellow");
  const [gem, setGem] = useState<GemKey | "none">("diamond");
  const [shape, setShape] = useState<Shape>("round");
  const [style, setStyle] = useState<Style>("solitaire");
  const [stoneMm, setStoneMm] = useState("6.5");
  const [dome, setDome] = useState(0.7);
  const [aiOn, setAiOn] = useState(false);
  const [aiProgress, setAiProgress] = useState<number | null>(null);

  const [glb, setGlb] = useState<ArrayBuffer | null>(null);
  const viewCanvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const cancelled = useRef(false);

  /* reset per product */
  useEffect(() => {
    cancelled.current = false;
    setSrc(null); setMask(null); setCut(null); setVec(null); setInfo(null); setErr(null); setGlb(null); setBusy(null); setAiProgress(null);
    const k = guess?.kind ?? "pendant";
    setKind(k); setMethod(round(k) ? "parametric" : "relief");
    setSizeMm(String(DEFAULT_MM[k] ?? 26)); setInnerMm(k === "ring" ? "17.3" : "58");
    if (guess) { setMetal(guess.metal); setGem(guess.gem ?? "none"); setShape(guess.shape); setStyle(guess.style); setStoneMm(String(guess.stoneMm)); }
    if (product) api.get<{ enabled: boolean }>("/api/crm/products/ai-3d/config").then((c) => setAiOn(!!c.enabled)).catch(() => setAiOn(false));
    return () => { cancelled.current = true; viewer.current?.dispose(); viewer.current = null; };
  }, [product?.id, guess]);

  /* ── 1. photo in ── */
  async function loadPhoto(url: string) {
    setErr(null); setGlb(null); setBusy("Reading the photo…");
    try {
      const img = await loadImage(url);
      const c = toWorking(img, 1400);
      setSrc(c);
      await removeBackground(c, false);
    } catch (e) { setErr((e as Error).message); setBusy(null); }
  }
  function onFile(f: File | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) { setErr("Please choose a photo (JPG, PNG or WebP)."); return; }
    loadPhoto(URL.createObjectURL(f));
  }

  /* ── 2. background → mask → vectors + colours ── */
  async function removeBackground(c: HTMLCanvasElement, forceAi: boolean) {
    setErr(null);
    let m: HTMLCanvasElement | null = null;
    if (!forceAi) {
      setBusy("Removing the background…");
      const r = autoMask(c);
      if ("mask" in r) m = r.mask;
    }
    if (!m) {
      try { m = await aiMask(c, (msg) => setBusy(msg)); }
      catch { setErr("The background couldn't be removed automatically. Use a photo on a plain white or grey background."); setBusy(null); return; }
    }
    if (cancelled.current) return;
    setBusy("Tracing the outline into vectors…");
    await new Promise((r) => setTimeout(r, 30));
    const v = vectorize(m);
    if (!v.regions.length) { setErr("No piece was found in the photo."); setBusy(null); return; }
    setMask(m); setCut(applyMask(c, m)); setVec(v);
    const a = analyse(c, m);
    setInfo(a); setMetal(a.metal);
    if (a.gem) setGem(a.gem);
    setBusy(null);
  }

  /* ── 3. build 3D and preview it with the shop's own loader + viewer ── */
  const spec: JewelSpec = useMemo(() => ({
    kind, metal, gem: gem === "none" ? null : gem, shape, style: gem === "none" ? "plain" : style,
    stoneMm: Number(stoneMm) || 6, motif: null,
  }), [kind, metal, gem, shape, style, stoneMm]);

  async function build() {
    if (method === "ai") return;
    setErr(null); setBusy("Building the 3D model…");
    await new Promise((r) => setTimeout(r, 30));
    try {
      let group;
      if (method === "relief") {
        if (!vec || !cut || !mask) throw new Error("Add a photo first.");
        group = buildRelief(vec, { kind, sizeMm: Number(sizeMm) || 26, metal, photo: cut, mask, dome });
      } else group = buildParametric(spec).group;
      const out = await exportGlb(group);
      if (cancelled.current) return;
      setGlb(out);
      await preview(out);
    } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  }

  async function preview(buf: ArrayBuffer) {
    if (!viewCanvas.current) return;
    const url = URL.createObjectURL(new Blob([buf], { type: "model/gltf-binary" }));
    try {
      const [{ loadJewelModel }, { createViewer }] = await Promise.all([import("@jewel3d/custom"), import("@jewel3d/viewer")]);
      const pieces = await loadJewelModel(url, {
        kind, metal,
        innerMm: round(kind) ? Number(innerMm) || undefined : undefined,
      });
      viewer.current?.dispose();
      viewer.current = createViewer(viewCanvas.current, spec, { jewel: pieces[0], background: "#f3f1ed" });
    } finally { URL.revokeObjectURL(url); }
  }

  /* ── 4. publish ── */
  async function publish() {
    if (!product || !glb) return;
    setBusy("Publishing to the shop…"); setErr(null);
    try {
      const q = new URLSearchParams({ fileName: `${product.sku || "piece"}-photo3d.glb`, source: "photo", piece: "0" });
      if (round(kind)) q.set("mm", innerMm || (kind === "ring" ? "17.3" : "58"));
      const res = await fetch(`${API_URL}/api/crm/products/${product.id}/model3d?${q}`, {
        method: "PUT", body: glb,
        headers: { "Content-Type": "model/gltf-binary", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Upload failed (${res.status})`);
      onSaved(`3D model created from the photo — ${product.name} now has "View in 3D" and 3D try-on on the shop`);
    } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  }

  async function runAi() {
    if (!product || !cut) return;
    setErr(null); setAiProgress(0); setBusy("Sending the photo to the AI 3D service…");
    try {
      // the cut-out on white, at most 1024 px — clean input gives the cleanest geometry
      const s = Math.min(1, 1024 / Math.max(cut.width, cut.height));
      const c = document.createElement("canvas"); c.width = Math.round(cut.width * s); c.height = Math.round(cut.height * s);
      const x = c.getContext("2d")!; x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(cut, 0, 0, c.width, c.height);
      const { taskId } = await api.post<{ taskId: string }>(`/api/crm/products/${product.id}/model3d/ai`, { image: c.toDataURL("image/jpeg", 0.92) });
      const mm = round(kind) ? innerMm : "";
      for (;;) {
        await new Promise((r) => setTimeout(r, 5000));
        if (cancelled.current) return;
        const st = await api.get<{ status: string; progress: number; model3d?: string; error?: string }>(`/api/crm/products/${product.id}/model3d/ai/${taskId}${mm ? `?mm=${mm}` : ""}`);
        setAiProgress(st.progress ?? 0);
        setBusy(`AI is sculpting the piece… ${st.progress ?? 0}%`);
        if (st.status === "SUCCEEDED") { onSaved(`AI 3D model ready — ${product.name} now has "View in 3D" and 3D try-on on the shop`); break; }
        if (st.error || st.status === "FAILED" || st.status === "CANCELED") throw new Error(st.error ?? "The AI 3D service couldn't build this piece.");
      }
    } catch (e) { setErr((e as Error).message); }
    setBusy(null); setAiProgress(null);
  }

  const canRelief = !round(kind);
  const ready = !!vec;

  return (
    <Modal open={!!product} onClose={onClose} title={`Photo → 3D · ${product?.name ?? ""}`} wide>
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Upload a clear photo of the piece on a plain background. It's cut out, traced into vectors and turned into a real 3D model —
          once published it shows on the shop in <b>View in 3D</b> and the <b>3D virtual try-on</b>.
        </p>

        {/* Step 1 — photo */}
        <section>
          <StepTitle n={1} done={!!src}>Photo of the piece</StepTitle>
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted">
              <ImageUp className="size-4" /> Upload photo
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            </label>
            {product?.image && <Button variant="outline" onClick={() => loadPhoto(product.image!.startsWith("/") ? API_URL + product.image : product.image!)}>Use catalogue photo</Button>}
            {src && <Button variant="ghost" onClick={() => removeBackground(src, true)} disabled={!!busy}><Wand2 className="size-4" /> Re-cut with AI</Button>}
          </div>
        </section>

        {/* Step 2 — vectors */}
        {ready && cut && vec && (
          <section>
            <StepTitle n={2} done>Cut-out &amp; vector outline</StepTitle>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="relative overflow-hidden rounded-xl border border-border" style={{ background: "repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0/16px 16px" }}>
                <img src={cut.toDataURL("image/png")} alt="Cut-out" className="block w-full" />
                <svg viewBox={`0 0 ${vec.width} ${vec.height}`} className="absolute inset-0 size-full">
                  <path d={vec.svg} fill="rgba(212,175,106,.18)" fillRule="evenodd" stroke="#b8862f" strokeWidth={Math.max(1.5, vec.width / 300)} vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2"><PenTool className="size-4 text-primary" /> {vec.regions.length} shape{vec.regions.length > 1 ? "s" : ""} · {vec.points} vector points</div>
                {info && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><i className="size-3.5 rounded-full border border-border" style={{ background: info.metalCss }} /> {METALS[info.metal].label} detected</span>
                    {info.gem && <span className="inline-flex items-center gap-1.5"><i className="size-3.5 rounded-full border border-border" style={{ background: info.gemCss ?? GEMS[info.gem].color }} /> {GEMS[info.gem].label} detected</span>}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">If the outline misses part of the piece, try “Re-cut with AI” or a photo with a plainer background.</p>
              </div>
            </div>
          </section>
        )}

        {/* Step 3 — 3D */}
        {ready && (
          <section>
            <StepTitle n={3} done={!!glb}>Make it 3D</StepTitle>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <Field label="Type of piece">
                <Select value={kind} onChange={(v) => { const k = v as JewelKind; setKind(k); setGlb(null); setMethod(round(k) ? "parametric" : method === "parametric" ? "relief" : method); setSizeMm(String(DEFAULT_MM[k] ?? 26)); setInnerMm(k === "ring" ? "17.3" : "58"); }}>
                  {KINDS.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="Method">
                <Select value={method} onChange={(v) => { setMethod(v as Method); setGlb(null); }}>
                  {canRelief && <option value="relief">From the photo (vector relief)</option>}
                  <option value="parametric">3D CAD style (generated)</option>
                  {aiOn && <option value="ai">AI full 3D (Meshy)</option>}
                </Select>
              </Field>
              {round(kind)
                ? <Field label={kind === "ring" ? "Inner diameter (mm)" : "Bangle inner diameter (mm)"}><Input value={innerMm} onChange={setInnerMm} /></Field>
                : method !== "ai" && <Field label={isEarring(kind) ? "Length of one earring (mm)" : isNeck(kind) && kind !== "pendant" ? "Width across (mm)" : "Height of the piece (mm)"}><Input value={sizeMm} onChange={setSizeMm} /></Field>}
            </div>

            {method !== "ai" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Metal">
                  <Select value={metal} onChange={(v) => setMetal(v as Metal)}>{(Object.keys(METALS) as Metal[]).map((m) => <option key={m} value={m}>{METALS[m].label}</option>)}</Select>
                </Field>
                {method === "parametric" ? (
                  <>
                    <Field label="Stone">
                      <Select value={gem} onChange={(v) => setGem(v as GemKey | "none")}>
                        <option value="none">No stone</option>
                        {(Object.keys(GEMS) as GemKey[]).map((g) => <option key={g} value={g}>{GEMS[g].label}</option>)}
                      </Select>
                    </Field>
                    <Field label="Setting">
                      <Select value={style} onChange={(v) => setStyle(v as Style)}>
                        {(["solitaire", "halo", "pave", "halo-pave", "trilogy"] as Style[]).map((s) => <option key={s} value={s}>{s.replace("-", " + ")}</option>)}
                      </Select>
                    </Field>
                    <Field label="Cut">
                      <Select value={shape} onChange={(v) => setShape(v as Shape)}>{(["round", "oval", "cushion", "emerald", "pear"] as Shape[]).map((s) => <option key={s} value={s}>{s}</option>)}</Select>
                    </Field>
                    <Field label="Centre stone (mm)"><Input value={stoneMm} onChange={setStoneMm} /></Field>
                  </>
                ) : (
                  <Field label={`Dome / depth · ${Math.round(dome * 100)}%`}>
                    <input type="range" min={0.2} max={1.4} step={0.05} value={dome} onChange={(e) => setDome(Number(e.target.value))} className="h-9 w-full accent-[var(--color-primary)]" />
                  </Field>
                )}
              </div>
            )}

            {method === "ai" ? (
              <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3 text-sm">
                <p className="text-muted-foreground">The cut-out is sent to the AI 3D service, which sculpts full geometry (back, sides, settings). It takes 1–3 minutes, and the model is published automatically when it's ready.</p>
                {aiProgress !== null && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${aiProgress}%` }} /></div>}
                <Button className="mt-3" onClick={runAi} disabled={!!busy}><Sparkles className="size-4" /> Create with AI</Button>
              </div>
            ) : (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={build} disabled={!!busy}><Box className="size-4" /> {glb ? "Rebuild 3D" : "Build 3D model"}</Button>
                  {glb && <Button variant="ghost" onClick={() => viewer.current?.reset()}><RotateCcw className="size-4" /> Reset view</Button>}
                </div>
                <div className={glb ? "mt-3 aspect-[4/3] overflow-hidden rounded-xl border border-border" : "hidden"}>
                  <canvas ref={viewCanvas} className="size-full touch-none" />
                </div>
                {glb && <p className="mt-1.5 text-xs text-muted-foreground">Drag to rotate · this is exactly what customers will see. {(glb.byteLength / 1048576).toFixed(1)} MB</p>}
              </>
            )}
          </section>
        )}

        {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {busy}</p>}
        {err && <p className="text-sm text-danger">{err}</p>}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {method !== "ai" && <Button onClick={publish} disabled={!glb || !!busy}><Check className="size-4" /> Publish to shop</Button>}
        </div>
      </div>
    </Modal>
  );
}

function StepTitle({ n, done, children }: { n: number; done?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold">
      <span className={done ? "flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground" : "flex size-5 items-center justify-center rounded-full border border-border text-[11px]"}>{done ? <Check className="size-3" /> : n}</span>
      {children}
    </div>
  );
}
