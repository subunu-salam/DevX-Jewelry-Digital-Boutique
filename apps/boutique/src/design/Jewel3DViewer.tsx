import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2, Maximize2, Minimize2, Pause, Play, RotateCcw, Rotate3d } from "lucide-react";
import { cn } from "@ui";
import { GEMS, METALS, specFromProduct, type GemKey, type Metal } from "@/lib/jewel3d/spec";
import type { Viewer } from "@/lib/jewel3d/viewer";
import { API_URL } from "@/lib/api";

const SWATCH: Record<Metal, string> = {
  yellow: "radial-gradient(circle at 35% 30%, #fff3c4, #e9c35f 45%, #8a6416)",
  white: "radial-gradient(circle at 35% 30%, #ffffff, #d9dde2 45%, #868c94)",
  rose: "radial-gradient(circle at 35% 30%, #ffe3d6, #e7ab8f 45%, #91533f)",
};
const GEM_CHOICES: GemKey[] = ["diamond", "ruby", "sapphire", "emerald", "morganite", "amethyst", "citrine", "aquamarine"];

interface ProductLike { name: string; slug?: string; metalColor?: string | null; stoneType?: string | null; tags?: string[]; category?: { slug: string } | null; tryOn?: { type: string } | null; model3d?: string | null }

/** Photoreal, interactive 3D view of a piece — generated from its catalogue details. */
export function Jewel3DViewer({ product, className }: { product: ProductLike; className?: string }) {
  const spec = useMemo(() => specFromProduct(product), [product]);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [metal, setMetal] = useState<Metal>(spec?.metal ?? "yellow");
  const [gem, setGem] = useState<GemKey | null>(spec?.gem ?? null);
  const [spin, setSpin] = useState(true);
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!spec || !canvas.current) return;
    let alive = true;
    setState("loading");
    const model = product.model3d;
    Promise.all([
      import("@/lib/jewel3d/viewer"),
      // the real CAD model uploaded in the CRM, if any (falls back to the generated piece)
      model ? import("@/lib/jewel3d/custom").then(({ loadProductModel }) => loadProductModel(model, API_URL, spec)).catch(() => null) : Promise.resolve(null),
    ]).then(([{ createViewer }, jewel]) => {
      if (!alive || !canvas.current) return;
      try { viewer.current = createViewer(canvas.current, spec, { jewel: jewel ?? undefined }); setState("ready"); }
      catch { setState("error"); }
    }).catch(() => alive && setState("error"));
    const onFs = () => setFull(document.fullscreenElement === wrap.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => { alive = false; document.removeEventListener("fullscreenchange", onFs); viewer.current?.dispose(); viewer.current = null; };
  }, [spec, product.model3d]);

  if (!spec) return null;
  const pickMetal = (m: Metal) => { setMetal(m); viewer.current?.setMetal(m); };
  const pickGem = (g: GemKey) => { setGem(g); viewer.current?.setGem(g); };
  const toggleSpin = () => { const v = !spin; setSpin(v); viewer.current?.setAutoRotate(v); };
  const snap = () => {
    const url = viewer.current?.snapshot(); if (!url) return;
    const a = document.createElement("a"); a.href = url; a.download = `aurelia-${product.slug ?? "piece"}-3d.png`; a.click();
  };
  const fullscreen = () => { if (document.fullscreenElement) document.exitFullscreen(); else wrap.current?.requestFullscreen?.(); };

  return (
    <div ref={wrap} className={cn("relative overflow-hidden rounded-[22px] bg-[#f6f4f1]", full ? "h-screen w-screen rounded-none" : "aspect-square w-full", className)}>
      <canvas ref={canvas} className="size-full touch-none" aria-label={`3D view of ${product.name}. Drag to rotate, pinch or scroll to zoom.`} />

      {state === "loading" && <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-[#6F675B]"><Loader2 className="size-4 animate-spin" /> Preparing 3D view…</div>}
      {state === "error" && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-[#6F675B]">3D isn't supported on this device.</div>}

      <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#26221D] backdrop-blur"><Rotate3d className="size-3.5" /> 3D · drag to rotate</span>

      {/* Toolbar */}
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-1.5 rounded-2xl bg-white/85 p-1.5 shadow-sm backdrop-blur">
        <Tool label="Reset view" onClick={() => { viewer.current?.reset(); setSpin(true); }}><RotateCcw className="size-4" /></Tool>
        <Tool label={spin ? "Stop rotating" : "Rotate"} onClick={toggleSpin}>{spin ? <Pause className="size-4" /> : <Play className="size-4" />}</Tool>
        <Tool label="Save image" onClick={snap}><Camera className="size-4" /></Tool>
        <Tool label={full ? "Exit full screen" : "Full screen"} onClick={fullscreen}>{full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</Tool>
      </div>

      {/* Configurator */}
      <div className="absolute inset-x-0 bottom-3 flex flex-wrap items-center justify-center gap-2 px-3">
        <div className="flex items-center gap-1.5 rounded-full bg-white/90 p-1.5 shadow-sm backdrop-blur" role="radiogroup" aria-label="Metal">
          {(Object.keys(METALS) as Metal[]).map((m) => (
            <button key={m} role="radio" aria-checked={metal === m} title={METALS[m].label} onClick={() => pickMetal(m)}
              className={cn("size-7 rounded-full ring-offset-2 transition", metal === m ? "ring-2 ring-[#A8874E]" : "hover:scale-110")} style={{ background: SWATCH[m] }} />
          ))}
        </div>
        {gem && gem !== "pearl" && (
          <div className="flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full bg-white/90 p-1.5 shadow-sm backdrop-blur" role="radiogroup" aria-label="Centre stone">
            {GEM_CHOICES.map((g) => (
              <button key={g} role="radio" aria-checked={gem === g} title={GEMS[g].label} onClick={() => pickGem(g)}
                className={cn("size-7 shrink-0 rounded-full ring-offset-2 transition", gem === g ? "ring-2 ring-[#A8874E]" : "hover:scale-110")}
                style={{ background: `radial-gradient(circle at 35% 30%, #fff, ${GEMS[g].color} 55%, ${g === "diamond" ? "#9fb0c8" : GEMS[g].color})`, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.08)" }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Tool({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} title={label} aria-label={label} className="flex size-9 items-center justify-center rounded-xl text-[#26221D] transition hover:bg-black/5">{children}</button>;
}
