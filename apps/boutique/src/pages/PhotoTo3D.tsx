import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Box, Camera, Check, Download, ImageUp, Loader2, Sparkles, Wand2 } from "lucide-react";
import { cn } from "@ui";
import SubHeader from "@/components/SubHeader";
import OwnerGate from "@/components/OwnerGate";
import { API_URL } from "@/lib/api";
import { ownerFetch, ownerToken } from "@/lib/owner";
import { GEMS, METALS, specFromProduct, type GemKey, type JewelKind, type JewelSpec, type Metal } from "@/lib/jewel3d/spec";
import type { PhotoAnalysis } from "@/lib/jewel3d/photo3d";
import type { Jewel } from "@/lib/jewel3d/build";
import type { Viewer } from "@/lib/jewel3d/viewer";

/** Owner tool: one product photo → vector outline → 3D model → live in "View in 3D" and the try-on. */
export default function PhotoTo3D() {
  return (
    <div>
      <SubHeader title="Photo → 3D & Try-On" to="/ai" />
      <OwnerGate><Panel /></OwnerGate>
    </div>
  );
}

interface Item { id: string; name: string; sku: string; slug: string; category: string | null; image: string | null; metal?: string; model3d?: string | null }
const KINDS: { k: JewelKind; label: string }[] = [
  { k: "stud", label: "Stud earring" }, { k: "drop", label: "Drop earring" }, { k: "hoop", label: "Hoop earring" },
  { k: "pendant", label: "Pendant" }, { k: "chain", label: "Necklace / chain" }, { k: "riviere", label: "Rivière / tennis necklace" },
  { k: "choker", label: "Choker" }, { k: "ring", label: "Ring" }, { k: "bangle", label: "Bangle" }, { k: "tennis", label: "Tennis bracelet" },
];
type Step = "idle" | "working" | "ready" | "publishing" | "done";

/** Hand a photo over from the Catalog Studio (same tab, no upload needed). */
export let pendingPhoto: string | null = null;
export const handOffPhoto = (dataUrl: string) => { pendingPhoto = dataUrl; };

function Panel() {
  const [params] = useSearchParams();
  const [items, setItems] = useState<Item[]>([]);
  const [pid, setPid] = useState(params.get("product") ?? "");
  const item = items.find((i) => i.id === pid) ?? null;
  const baseSpec = useMemo<JewelSpec | null>(() => (item ? specFromProduct({ name: item.name, category: item.category?.toLowerCase() ?? "", metalColor: item.metal ?? "" }) : null), [item]);

  const [photo, setPhoto] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [a, setA] = useState<PhotoAnalysis | null>(null);
  const [kind, setKind] = useState<JewelKind | null>(null);
  const [sizeMm, setSizeMm] = useState(30);
  const [relief, setRelief] = useState(1);
  const [metal, setMetal] = useState<Metal>("yellow");
  const [gem, setGem] = useState<GemKey | null>(null);
  const [stones3d, setStones3d] = useState(true);
  const [showVec, setShowVec] = useState(true);
  const [forceAi, setForceAi] = useState(false);
  const jewel = useRef<Jewel | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<Viewer | null>(null);

  useEffect(() => {
    ownerFetch<Item[]>("/api/crm/products").then((l) => { setItems(l); if (!pid && l[0]) setPid(l[0].id); }).catch((e) => setErr((e as Error).message));
    if (pendingPhoto) { setPhoto(pendingPhoto); pendingPhoto = null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (baseSpec) { setKind(baseSpec.kind); import("@/lib/jewel3d/photo3d").then((m) => setSizeMm(m.defaultSizeMm(baseSpec.kind))); } }, [baseSpec]);

  /* 1–3: cut out, read, vectorise */
  useEffect(() => {
    if (!photo || !kind) return;
    let alive = true;
    setStep("working"); setErr(null); setA(null);
    (async () => {
      const m = await import("@/lib/jewel3d/photo3d");
      const img = await m.loadImage(photo);
      const r = await m.analysePhoto(img, kind, (t) => alive && setMsg(t), forceAi);
      if (!alive) return;
      setA(r); setMetal(r.metal); setGem(null); setStep("ready");
    })().catch((e) => { if (alive) { setErr((e as Error).message); setStep("idle"); } });
    return () => { alive = false; };
    // re-analyse when the kind changes between face/hand families only matters for pairs; keep simple
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo, forceAi]);

  /* 4: build + preview (rebuilds as settings change) */
  useEffect(() => {
    if (!a || !kind || !baseSpec || !canvas.current) return;
    let alive = true;
    const id = setTimeout(async () => {
      const [{ buildFromPhoto }, { createViewer }] = await Promise.all([import("@/lib/jewel3d/photo3d"), import("@/lib/jewel3d/viewer")]);
      if (!alive || !canvas.current) return;
      const spec: JewelSpec = { ...baseSpec, kind, metal };
      try {
        const j = buildFromPhoto(a, { kind, sizeMm, relief, metal, gem, stones3d, spec });
        viewer.current?.dispose();
        jewel.current = j;
        viewer.current = createViewer(canvas.current, spec, { jewel: j });
      } catch (e) { setErr((e as Error).message); }
    }, 180);
    return () => { alive = false; clearTimeout(id); };
  }, [a, kind, sizeMm, relief, metal, gem, stones3d, baseSpec]);
  useEffect(() => () => viewer.current?.dispose(), []);

  function onFile(f?: File) {
    if (!f) return;
    const r = new FileReader(); r.onload = () => setPhoto(String(r.result)); r.readAsDataURL(f);
  }

  async function publish() {
    if (!item || !jewel.current) return;
    setStep("publishing"); setErr(null);
    try {
      const { exportGlb, modelSizeMm } = await import("@/lib/jewel3d/photo3d");
      const glb = await exportGlb(jewel.current);
      // rings & bracelets: inner diameter; other pieces: longest side
      const mm = kind === "ring" ? 17.3 : ["bangle", "tennis", "linkBracelet"].includes(kind ?? "") ? Math.round((jewel.current.innerR || 29) * 20) / 10 : Math.round(modelSizeMm(jewel.current) * 10) / 10;
      const q = new URLSearchParams({ fileName: "photo-3d.glb", piece: "0", mm: String(mm) });
      const res = await fetch(`${API_URL}/api/crm/products/${item.id}/model3d?${q}`, {
        method: "PUT", body: glb, headers: { "Content-Type": "model/gltf-binary", Authorization: `Bearer ${ownerToken() ?? ""}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Upload failed (${res.status})`);
      setStep("done");
    } catch (e) { setErr((e as Error).message); setStep("ready"); }
  }

  async function download(kindOf: "glb" | "svg") {
    const m = await import("@/lib/jewel3d/photo3d");
    let blob: Blob;
    if (kindOf === "glb") { if (!jewel.current) return; blob = new Blob([await m.exportGlb(jewel.current)], { type: "model/gltf-binary" }); }
    else { if (!a) return; blob = new Blob([m.toSvg(a, sizeMm / Math.max(a.w, a.h))], { type: "image/svg+xml" }); }
    const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = `${item?.sku ?? "piece"}-photo3d.${kindOf}`; el.click();
  }

  if (step === "done" && item) {
    return (
      <div className="px-4 pt-6 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand text-white"><Check className="size-8" /></div>
        <h2 className="mt-4 font-serif text-2xl">{item.name} is live in 3D</h2>
        <p className="mt-2 text-sm text-muted-foreground">Customers can now rotate it in 360° on the product page and wear it in the virtual try-on.</p>
        <div className="mt-6 grid gap-2.5">
          <Link to={`/try-on/${item.slug}`} className="flex items-center justify-center gap-2 rounded-full bg-brand py-3.5 text-sm font-semibold text-white"><Sparkles className="size-4" /> Try it on</Link>
          <Link to={`/product/${item.slug}`} className="flex items-center justify-center gap-2 rounded-full border border-border py-3.5 text-sm font-semibold"><Box className="size-4" /> View in 3D</Link>
          <button onClick={() => { setStep("idle"); setPhoto(null); setA(null); }} className="text-[12.5px] font-semibold text-muted-foreground underline underline-offset-4">Make another</button>
        </div>
      </div>
    );
  }

  const k = a ? 300 / Math.max(a.w, a.h) : 1;
  return (
    <div className="px-4 pb-10 pt-1">
      <p className="text-[14px] leading-relaxed text-muted-foreground">
        Upload one clear photo of the piece. It's cut out, read (metal &amp; stones), traced into a vector outline and built into a true-to-size 3D model — then it's live for 360° view and virtual try-on.
      </p>

      <label className="mt-4 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Piece</label>
      <select className="ipt mt-1" value={pid} onChange={(e) => setPid(e.target.value)}>
        {items.map((i) => <option key={i.id} value={i.id}>{i.name} · {i.sku}{i.model3d ? " · has 3D" : ""}</option>)}
      </select>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <PickBtn icon={<Camera className="size-5" />} label="Camera" capture onFile={onFile} />
        <PickBtn icon={<ImageUp className="size-5" />} label="Upload" onFile={onFile} />
        <button disabled={!item?.image} onClick={() => item?.image && setPhoto(item.image.startsWith("/") ? item.image : item.image)} className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-surface py-3 text-[12px] font-semibold disabled:opacity-40">
          <Box className="size-5 text-brand-deep" /> Catalogue photo
        </button>
      </div>
      <p className="mt-2 text-[11.5px] text-muted-foreground">Best results: piece flat and face-on, even light, on a plain background that contrasts with it (dark cloth for white stones).</p>

      {step === "working" && <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {msg || "Working…"}</div>}
      {err && <div className="mt-4 rounded-2xl bg-sand p-3 text-sm">{err}</div>}

      {a && kind && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="relative overflow-hidden rounded-2xl border border-border bg-white">
              <svg viewBox={`0 0 ${a.w} ${a.h}`} className="aspect-square w-full">
                <image href={a.cut.toDataURL()} width={a.w} height={a.h} />
                {showVec && <SvgOutline a={a} sw={1.6 / k} />}
                {showVec && stones3d && a.stones.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="none" stroke="#2b7fd6" strokeWidth={1.4 / k} />)}
              </svg>
              <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">Vector outline</span>
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-border">
              <canvas ref={canvas} className="aspect-square w-full touch-none" />
              <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">3D · drag</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 text-[11.5px]">
            <Tag>{METALS[a.metal].label} read from photo</Tag>
            <Tag>{a.stones.length ? `${a.stones.length} stone${a.stones.length > 1 ? "s" : ""} found${a.gem ? ` · ${GEMS[a.gem].label}` : ""}` : "No stones found"}</Tag>
            <Tag>{a.paths.length} vector paths</Tag>
            {a.pair && <Tag>Pair found — left earring used, mirrored for the right ear</Tag>}
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 text-[12.5px]">
            <Row label="Type">
              <select className="ipt" value={kind} onChange={(e) => setKind(e.target.value as JewelKind)}>{KINDS.map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}</select>
            </Row>
            {kind !== "ring" && <Row label={`Size · ${sizeMm} mm`}><input type="range" min={5} max={kind === "chain" || kind === "riviere" || kind === "choker" ? 200 : 90} value={sizeMm} onChange={(e) => setSizeMm(+e.target.value)} className="w-full accent-[var(--color-brand)]" /></Row>}
            {!["ring", "bangle", "tennis", "linkBracelet"].includes(kind) && <Row label={`Relief · ${relief.toFixed(1)}×`}><input type="range" min={0.3} max={2.5} step={0.1} value={relief} onChange={(e) => setRelief(+e.target.value)} className="w-full accent-[var(--color-brand)]" /></Row>}
            <Row label="Metal">
              <div className="flex gap-2">{(Object.keys(METALS) as Metal[]).map((m) => (
                <button key={m} title={METALS[m].label} onClick={() => setMetal(m)} className={cn("size-7 rounded-full ring-offset-2", metal === m && "ring-2 ring-brand")} style={{ background: `radial-gradient(circle at 35% 30%, #fff, ${METALS[m].color} 50%, #6b5a3a)` }} />
              ))}</div>
            </Row>
            <Row label="Stones">
              <select className="ipt" value={gem ?? ""} onChange={(e) => setGem((e.target.value || null) as GemKey | null)}>
                <option value="">As detected</option>
                {(Object.keys(GEMS) as GemKey[]).filter((g) => g !== "pearl").map((g) => <option key={g} value={g}>{GEMS[g].label}</option>)}
              </select>
            </Row>
            <div className="mt-2 flex flex-wrap gap-3">
              <label className="flex items-center gap-2"><input type="checkbox" checked={stones3d} onChange={(e) => setStones3d(e.target.checked)} className="accent-[var(--color-brand)]" /> Real 3D stones</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showVec} onChange={(e) => setShowVec(e.target.checked)} className="accent-[var(--color-brand)]" /> Show vectors</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={forceAi} onChange={(e) => setForceAi(e.target.checked)} className="accent-[var(--color-brand)]" /> AI background removal</label>
            </div>
            {["ring", "bangle", "tennis"].includes(kind) && <p className="mt-2 text-[11.5px] text-muted-foreground">Rings and bracelets are rebuilt as a full 360° model from the metal, stones and stone shape in your photo — one photo can't show the back of a band.</p>}
          </div>

          <button onClick={publish} disabled={step === "publishing" || !item} className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-3.5 text-sm font-semibold text-background disabled:opacity-50">
            {step === "publishing" ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} Publish 3D & try-on to the boutique
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => download("glb")} className="flex items-center justify-center gap-1.5 rounded-full border border-border py-2.5 text-[12.5px] font-semibold"><Download className="size-3.5" /> 3D model (.glb)</button>
            <button onClick={() => download("svg")} className="flex items-center justify-center gap-1.5 rounded-full border border-border py-2.5 text-[12.5px] font-semibold"><Download className="size-3.5" /> Vector (.svg)</button>
          </div>
        </div>
      )}
      <style>{`.ipt{width:100%;border:1px solid var(--color-border);background:var(--color-background);border-radius:.75rem;padding:.55rem .75rem;font-size:14px;outline:none}.ipt:focus{border-color:var(--color-brand)}`}</style>
    </div>
  );
}

function SvgOutline({ a, sw }: { a: PhotoAnalysis; sw: number }) {
  const d = a.paths.map((l) => "M" + l.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + "Z").join("");
  return <path d={d} fill="none" stroke="#d6453d" strokeWidth={sw} fillRule="evenodd" />;
}
function PickBtn({ icon, label, capture, onFile }: { icon: React.ReactNode; label: string; capture?: boolean; onFile: (f?: File) => void }) {
  return (
    <label className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border border-border bg-surface py-3 text-[12px] font-semibold">
      <span className="text-brand-deep">{icon}</span>{label}
      <input type="file" accept="image/*" capture={capture ? "environment" : undefined} hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
    </label>
  );
}
const Tag = ({ children }: { children: React.ReactNode }) => <span className="rounded-full bg-sand px-2.5 py-1 font-medium">{children}</span>;
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mt-2.5 flex items-center gap-3"><span className="w-24 shrink-0 text-muted-foreground">{label}</span><div className="flex-1">{children}</div></div>;
}
