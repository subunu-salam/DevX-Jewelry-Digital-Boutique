import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Eraser, FlipHorizontal2, ImageUp, Loader2, Paintbrush, RotateCw, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { cn } from "@ui";
import { api, API_URL } from "@/lib/api";
import { Button, Field, Input, Select } from "@/components/ui";
import { TYPE_DEFAULTS, aiMask, autoMask, canvas, exportCut, fullMask, loadImage, toWorking, transform, type TryOnType } from "@/lib/cutout";

const TYPES: TryOnType[] = ["necklace", "pendant", "earrings", "ring", "bracelet"];
type Tool = "erase" | "restore" | "anchor" | "split" | null;

export interface StudioProduct {
  id: string; name: string; image: string | null;
  tryOn?: { enabled: boolean; type: string; assetUrl: string | null; effectiveType: string | null; categoryType: string | null };
}

/**
 * Try-on Studio — turns a product photo into a clean, true-to-size try-on cut-out:
 * remove background (auto / AI), touch up with eraser & restore brush, rotate/flip,
 * split an earring pair, set the anchor point and the real width in mm.
 */
export default function TryOnStudio({ product, onClose, onSaved }: { product: StudioProduct | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [images, setImages] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [type, setType] = useState<TryOnType>("earrings");
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [ver, setVer] = useState(0); // bump to redraw
  const [tool, setTool] = useState<Tool>(null);
  const [brush, setBrush] = useState(24);
  const [tol, setTol] = useState(38);
  const [pair, setPair] = useState(false);
  const [split, setSplit] = useState(0.5);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null); // 0–1 of working canvas
  const [mm, setMm] = useState("16");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  const work = useRef<HTMLCanvasElement | null>(null);
  const mask = useRef<HTMLCanvasElement | null>(null);
  const history = useRef<HTMLCanvasElement[]>([]);
  const view = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const drawing = useRef<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  /* open: load settings + gallery */
  useEffect(() => {
    if (!product) return;
    const t = (product.tryOn?.effectiveType ?? product.tryOn?.categoryType ?? "earrings") as TryOnType;
    setEnabled(product.tryOn ? product.tryOn.enabled : true);
    setType(t); setPair(t === "earrings"); setSplit(0.5); setMm(String(TYPE_DEFAULTS[t].mm));
    setAnchor(null); setTool(null); setMsg(null); setSrcUrl(null); work.current = null; mask.current = null;
    api.get<{ images: string[] }>(`/api/crm/products/${product.id}`).then((d) => {
      const list = d.images?.length ? d.images : product.image ? [product.image] : [];
      setImages(list);
      if (list[0]) pick(list[0]);
    }).catch(() => { if (product.image) { setImages([product.image]); pick(product.image); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  async function pick(url: string) {
    setBusy("Loading photo…"); setMsg(null);
    try {
      const img = await loadImage(url);
      work.current = toWorking(img);
      mask.current = fullMask(work.current);
      history.current = [];
      setSrcUrl(url); setAnchor(null); setVer((v) => v + 1);
    } catch (e) { setMsg({ tone: "warn", text: (e as Error).message }); }
    finally { setBusy(null); }
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    const r = new FileReader(); r.onload = () => pick(String(r.result)); r.readAsDataURL(f);
  }

  const snapshot = () => { if (mask.current) { const c = canvas(mask.current.width, mask.current.height); c.getContext("2d")!.drawImage(mask.current, 0, 0); history.current = [...history.current.slice(-14), c]; } };
  const undo = () => { const last = history.current.pop(); if (last && mask.current) { const x = mask.current.getContext("2d")!; x.globalCompositeOperation = "copy"; x.drawImage(last, 0, 0); x.globalCompositeOperation = "source-over"; setVer((v) => v + 1); } };

  /* ── tools ── */
  function runAuto() {
    if (!work.current) return;
    const r = autoMask(work.current, tol);
    if ("error" in r) { setMsg({ tone: "warn", text: r.error }); return; }
    snapshot(); mask.current = r.mask; setVer((v) => v + 1);
    setMsg({ tone: "ok", text: "Background removed. Touch up with the eraser if anything is left." });
  }
  async function runAi() {
    if (!work.current) return;
    setMsg(null);
    try {
      const m = await aiMask(work.current, (t) => setBusy(t));
      snapshot(); mask.current = m; setVer((v) => v + 1);
      setMsg({ tone: "ok", text: "AI removed the background. On photos worn by a model, erase the skin/hair and keep only the piece." });
    } catch { setMsg({ tone: "warn", text: "The AI model couldn't load (network). Use Auto remove or the eraser instead." }); }
    finally { setBusy(null); }
  }
  function rotate(q: number, flip = false) {
    if (!work.current || !mask.current) return;
    work.current = transform(work.current, q, flip);
    mask.current = transform(mask.current, q, flip);
    history.current = []; setAnchor(null); setVer((v) => v + 1);
  }
  function resetMask() { if (work.current) { snapshot(); mask.current = fullMask(work.current); setVer((v) => v + 1); } }

  /* ── drawing ── */
  const draw = useCallback(() => {
    const c = view.current, w = work.current, m = mask.current, box = wrap.current;
    if (!c || !w || !m || !box) return;
    const s = Math.min((box.clientWidth - 2) / w.width, 560 / w.height, 1.6);
    c.width = Math.round(w.width * s); c.height = Math.round(w.height * s);
    const x = c.getContext("2d")!;
    x.clearRect(0, 0, c.width, c.height);
    // faint original so staff can see what's removed
    x.globalAlpha = 0.14; x.drawImage(w, 0, 0, c.width, c.height); x.globalAlpha = 1;
    const tmp = canvas(w.width, w.height); const tx = tmp.getContext("2d")!;
    tx.drawImage(w, 0, 0); tx.globalCompositeOperation = "destination-in"; tx.drawImage(m, 0, 0);
    x.drawImage(tmp, 0, 0, c.width, c.height);
    if (pair && type === "earrings") {
      x.strokeStyle = "#d4af6a"; x.setLineDash([6, 5]); x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(split * c.width, 0); x.lineTo(split * c.width, c.height); x.stroke(); x.setLineDash([]);
    }
    const a = anchor ?? null;
    if (a) {
      const ax = a.x * c.width, ay = a.y * c.height;
      x.strokeStyle = "#ff3b6b"; x.lineWidth = 2;
      x.beginPath(); x.arc(ax, ay, 9, 0, Math.PI * 2); x.moveTo(ax - 15, ay); x.lineTo(ax + 15, ay); x.moveTo(ax, ay - 15); x.lineTo(ax, ay + 15); x.stroke();
    }
    if (hover && (tool === "erase" || tool === "restore")) {
      x.strokeStyle = tool === "erase" ? "#ff3b6b" : "#4ade80"; x.lineWidth = 1.5;
      x.beginPath(); x.arc(hover.x * c.width, hover.y * c.height, brush * s / 2, 0, Math.PI * 2); x.stroke();
    }
  }, [anchor, brush, hover, pair, split, tool, type]);
  useEffect(() => { draw(); }, [draw, ver]);
  useEffect(() => { const r = () => draw(); window.addEventListener("resize", r); return () => window.removeEventListener("resize", r); }, [draw]);

  const toNorm = (e: React.PointerEvent) => { const r = view.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
  function paint(from: { x: number; y: number }, to: { x: number; y: number }) {
    const m = mask.current; if (!m) return;
    const x = m.getContext("2d")!;
    x.globalCompositeOperation = tool === "erase" ? "destination-out" : "source-over";
    x.strokeStyle = "#fff"; x.lineCap = "round"; x.lineWidth = brush;
    x.beginPath(); x.moveTo(from.x * m.width, from.y * m.height); x.lineTo(to.x * m.width, to.y * m.height); x.stroke();
    x.globalCompositeOperation = "source-over";
  }
  function down(e: React.PointerEvent) {
    if (!work.current) return;
    const p = toNorm(e);
    if (tool === "anchor") { setAnchor(p); setTool(null); return; }
    if (tool === "split") { setSplit(Math.min(0.9, Math.max(0.1, p.x))); return; }
    if (tool === "erase" || tool === "restore") { (e.target as HTMLElement).setPointerCapture(e.pointerId); snapshot(); drawing.current = p; paint(p, p); setVer((v) => v + 1); }
  }
  function move(e: React.PointerEvent) {
    const p = toNorm(e); setHover(p);
    if (tool === "split" && e.buttons) setSplit(Math.min(0.9, Math.max(0.1, p.x)));
    if (drawing.current) { paint(drawing.current, p); drawing.current = p; setVer((v) => v + 1); }
  }
  const up = () => { drawing.current = null; };

  /* ── save ── */
  async function save() {
    if (!product) return;
    if (!enabled) {
      setBusy("Saving…");
      try { await api.put(`/api/crm/products/${product.id}`, { tryOn: { enabled: false, type } }); onSaved("Try-on turned off for this piece"); }
      catch (e) { setMsg({ tone: "warn", text: (e as Error).message }); } finally { setBusy(null); }
      return;
    }
    if (!work.current || !mask.current) { setMsg({ tone: "warn", text: "Choose or upload a photo first." }); return; }
    const W = work.current.width, H = work.current.height;
    const isPair = pair && type === "earrings";
    const a = anchor ?? (() => { const d = TYPE_DEFAULTS[type].anchor; return { x: isPair ? d.x * split : d.x, y: d.y }; })();
    const r = exportCut(work.current, mask.current, { x: a.x * W, y: a.y * H }, isPair, isPair ? split * W : null);
    if ("error" in r) { setMsg({ tone: "warn", text: r.error }); return; }
    setBusy("Saving cut-out…");
    try {
      await api.put(`/api/crm/products/${product.id}/tryon-asset`, { type, png: r.png, width: r.width, height: r.height, anchorX: r.anchorX, anchorY: r.anchorY, widthMm: Number(mm) || null, pair: isPair, splitX: r.splitX });
      onSaved(`Try-on cut-out saved for ${product.name}`);
    } catch (e) { setMsg({ tone: "warn", text: (e as Error).message }); } finally { setBusy(null); }
  }
  async function removeStudio() {
    if (!product) return;
    setBusy("Removing…");
    try { await api.delete(`/api/crm/products/${product.id}/tryon-asset`); onSaved("Studio cut-out removed — the app will use the product photo"); }
    catch (e) { setMsg({ tone: "warn", text: (e as Error).message }); } finally { setBusy(null); }
  }

  if (!product) return null;
  const hasStudio = !!product.tryOn?.assetUrl?.startsWith("/api/public/tryon-assets/");
  const d = TYPE_DEFAULTS[type];

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 p-0 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-6xl flex-col overflow-hidden border border-border bg-card shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div><div className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-primary" /> Try-on Studio</div><div className="text-xs text-muted-foreground">{product.name}</div></div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted" aria-label="Close"><X className="size-4" /></button>
        </div>

        <div className="grid flex-1 overflow-hidden lg:grid-cols-[1fr_340px]">
          {/* Canvas */}
          <div className="flex min-h-[420px] flex-col overflow-y-auto p-4">
            <div className="mb-3 flex gap-2 overflow-x-auto">
              {images.map((u) => (
                <button key={u} onClick={() => pick(u)} className={cn("size-14 shrink-0 overflow-hidden rounded-lg border-2", srcUrl === u ? "border-primary" : "border-transparent opacity-70 hover:opacity-100")}>
                  <img src={u} alt="" className="size-full object-cover" />
                </button>
              ))}
              <label className="flex size-14 shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground hover:border-primary hover:text-primary">
                <ImageUp className="size-4" />Upload<input type="file" accept="image/*" className="hidden" onChange={onFile} />
              </label>
            </div>
            <div ref={wrap} className="relative flex flex-1 items-center justify-center rounded-xl" style={{ backgroundImage: "repeating-conic-gradient(#2a2d36 0% 25%, #1c1e25 0% 50%)", backgroundSize: "18px 18px" }}>
              {work.current ? (
                <canvas ref={view} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => { up(); setHover(null); }}
                  className={cn("max-w-full touch-none", tool === "anchor" || tool === "split" ? "cursor-crosshair" : tool ? "cursor-none" : "cursor-default")} />
              ) : <p className="p-10 text-center text-sm text-muted-foreground">{images.length ? "Loading…" : "This product has no photos — upload a front-facing photo of the piece."}</p>}
              {busy && <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-black/50 text-sm text-white"><Loader2 className="size-4 animate-spin" />{busy}</div>}
            </div>
            <p className="mt-2 text-[11.5px] text-muted-foreground">Best results: the piece alone, front-facing, on a plain white or grey background. Faint areas show what's been removed.</p>
          </div>

          {/* Controls */}
          <div className="space-y-4 overflow-y-auto border-t border-border p-4 text-sm lg:border-l lg:border-t-0">
            <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-[#d4af6a]" /> Try-on enabled for this piece</label>
            {enabled && (
              <>
                <Field label="How it's worn">
                  <Select value={type} onChange={(v) => { const t = v as TryOnType; setType(t); setPair(t === "earrings"); setMm(String(TYPE_DEFAULTS[t].mm)); setAnchor(null); }}>
                    {TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
                  </Select>
                </Field>

                <Section n={1} title="Remove the background">
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={runAuto} disabled={!work.current || !!busy}><Wand2 className="size-3.5" /> Auto (plain bg)</Button>
                    <Button variant="outline" size="sm" onClick={runAi} disabled={!work.current || !!busy}><Sparkles className="size-3.5" /> AI remove</Button>
                  </div>
                  <label className="mt-2 block text-[11px] text-muted-foreground">Auto tolerance · {tol}
                    <input type="range" min={12} max={80} value={tol} onChange={(e) => setTol(Number(e.target.value))} className="w-full accent-[#d4af6a]" />
                  </label>
                </Section>

                <Section n={2} title="Touch up">
                  <div className="grid grid-cols-3 gap-2">
                    <ToolBtn on={tool === "erase"} onClick={() => setTool(tool === "erase" ? null : "erase")}><Eraser className="size-3.5" /> Erase</ToolBtn>
                    <ToolBtn on={tool === "restore"} onClick={() => setTool(tool === "restore" ? null : "restore")}><Paintbrush className="size-3.5" /> Restore</ToolBtn>
                    <ToolBtn on={false} onClick={undo}>↶ Undo</ToolBtn>
                  </div>
                  <label className="mt-2 block text-[11px] text-muted-foreground">Brush size · {brush}px
                    <input type="range" min={4} max={120} value={brush} onChange={(e) => setBrush(Number(e.target.value))} className="w-full accent-[#d4af6a]" />
                  </label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <ToolBtn on={false} onClick={() => rotate(1)}><RotateCw className="size-3.5" /> Rotate</ToolBtn>
                    <ToolBtn on={false} onClick={() => rotate(0, true)}><FlipHorizontal2 className="size-3.5" /> Flip</ToolBtn>
                    <ToolBtn on={false} onClick={resetMask}>Reset</ToolBtn>
                  </div>
                </Section>

                {type === "earrings" && (
                  <Section n={3} title="Earrings">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={pair} onChange={(e) => setPair(e.target.checked)} className="accent-[#d4af6a]" /> Photo shows the pair side by side</label>
                    {pair && <div className="mt-2 flex items-center gap-2"><ToolBtn on={tool === "split"} onClick={() => setTool(tool === "split" ? null : "split")}>Set split line</ToolBtn><span className="text-[11px] text-muted-foreground">Drag the dashed line between the two earrings.</span></div>}
                    {!pair && <p className="mt-1 text-[11px] text-muted-foreground">One earring — it's mirrored for the other ear.</p>}
                  </Section>
                )}

                <Section n={type === "earrings" ? 4 : 3} title="Where it sits & real size">
                  <ToolBtn on={tool === "anchor"} onClick={() => setTool(tool === "anchor" ? null : "anchor")}><Crosshair className="size-3.5" /> {anchor ? "Move anchor point" : "Set anchor point"}</ToolBtn>
                  <p className="mt-1 text-[11px] text-muted-foreground">{d.anchorHint}{!anchor && " (Default: top-centre.)"}</p>
                  <div className="mt-3"><Field label={d.mmLabel}><Input type="number" value={mm} onChange={setMm} /></Field></div>
                  <p className="mt-1 text-[11px] text-muted-foreground">Used to show the piece at true size on the customer — measured from their face/hand.</p>
                </Section>
              </>
            )}

            {msg && <p className={cn("rounded-lg px-3 py-2 text-xs", msg.tone === "ok" ? "bg-success-bg text-success" : "bg-warning-bg text-warning")}>{msg.text}</p>}
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button onClick={save} disabled={!!busy}>{enabled ? "Save cut-out" : "Save"}</Button>
              {hasStudio && <Button variant="outline" onClick={removeStudio} disabled={!!busy}><Trash2 className="size-3.5" /> Remove cut-out</Button>}
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </div>
            {hasStudio && product.tryOn?.assetUrl && (
              <div>
                <div className="mb-1 text-[11px] text-muted-foreground">Current cut-out</div>
                <div className="flex justify-center rounded-lg p-3" style={{ backgroundImage: "repeating-conic-gradient(#2a2d36 0% 25%, #1c1e25 0% 50%)", backgroundSize: "14px 14px" }}>
                  <img src={`${API_URL}${product.tryOn.assetUrl}`} alt="Current cut-out" className="max-h-28 object-contain" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return <div><div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{n} · {title}</div>{children}</div>;
}
function ToolBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={cn("inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs transition", on ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{children}</button>;
}
