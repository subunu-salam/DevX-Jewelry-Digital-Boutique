import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft, Camera, CalendarClock, Download, FlipHorizontal2, ImageUp, Loader2, Lock, RefreshCw,
  RotateCcw, Share2, ShoppingBag, Sparkles, SwitchCamera, Video, Wand2,
} from "lucide-react";
import { cn } from "@ui";
import { api } from "@/lib/api";
import type { Product } from "@/lib/types";
import { useStore } from "@/context/store";
import { EASE, LuxuryButton, Modal, Price, t, useToast } from "@/design";
import { LABEL, TIPS, defaults, detect, lerp, place, preload, type Placement, type TryOnType } from "@/lib/tryon/engine";
import { prepareAsset, toJpeg, type Asset } from "@/lib/tryon/asset";

const DISCLAIMER = "Virtual try-on is a visualization only. Size, fit, colour and sparkle may differ from the actual piece.";

/** The customer's photo is kept in memory only for this visit, so they can try several pieces. */
let sessionPhoto: { url: string; w: number; h: number } | null = null;

interface Adjust { dx: number; dy: number; scale: number; rot: number; flip: boolean }
const NO_ADJ: Adjust = { dx: 0, dy: 0, scale: 1, rot: 0, flip: false };

export default function TryOn() {
  const { slug } = useParams();
  return slug ? <Studio key={slug} slug={slug} /> : <Picker />;
}

/* ───────────────────────── Picker (/try-on) ───────────────────────── */

function Picker() {
  const [items, setItems] = useState<Product[] | null>(null);
  const [type, setType] = useState<TryOnType | "all">("all");
  useEffect(() => { api.get<Product[]>("/api/public/products?limit=80").then((p) => setItems(p.filter((x) => x.tryOn && x.image))).catch(() => setItems([])); }, []);
  const types = useMemo(() => Array.from(new Set((items ?? []).map((p) => p.tryOn!.type))), [items]);
  const shown = (items ?? []).filter((p) => type === "all" || p.tryOn!.type === type);

  return (
    <div className="px-4 pb-6 pt-4">
      <Link to="/ai" className="inline-flex items-center gap-2 text-[13px] font-semibold text-muted-foreground"><ArrowLeft className="size-4" /> AI Studio</Link>
      <h1 className="mt-3 font-serif text-[40px] leading-none">Virtual try-on</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">Choose a piece, then see it on your own photo or live camera.</p>
      <PrivacyNote className="mt-3" />

      <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4">
        {(["all", ...types] as const).map((k) => (
          <button key={k} onClick={() => setType(k)} className={cn("shrink-0 rounded-full border px-4 py-2 text-[13px] font-semibold capitalize transition-colors", type === k ? "border-ink bg-ink text-on-ink" : "border-border bg-surface text-foreground/75")}>
            {k === "all" ? "All" : LABEL[k]}
          </button>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-6">
        {items === null && Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton aspect-[4/5] rounded-[18px]" />)}
        {shown.map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={t(0.6, i * 0.04)}>
            <Link to={`/try-on/${p.slug}`} className="group block">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[18px] bg-champagne">
                <img src={p.image!} alt={p.name} loading="lazy" className="size-full object-cover transition-transform duration-[1200ms] ease-[var(--ease-lux)] group-hover:scale-105" />
                <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-surface/95 px-2.5 py-1 text-[10.5px] font-semibold text-brand-deep"><Sparkles className="size-3" /> Try on</span>
              </div>
              <div className="mt-2.5 font-serif text-[17px] leading-tight">{p.name}</div>
              <Price priceMode={p.priceMode} basePrice={p.basePrice} discount={p.discount} size="sm" />
            </Link>
          </motion.div>
        ))}
      </div>
      {items && shown.length === 0 && <p className="mt-10 text-center text-muted-foreground">No pieces are set up for try-on yet.</p>}
    </div>
  );
}

/* ───────────────────────── Studio (/try-on/:slug) ───────────────────────── */

type Phase = "choose" | "photo" | "live" | "ai";

function Studio({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { addToCart } = useStore();

  const [product, setProduct] = useState<Product | null>(null);
  const [similar, setSimilar] = useState<Product[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [asset, setAsset] = useState<Asset | null | "loading">("loading");

  const [phase, setPhase] = useState<Phase>(sessionPhoto ? "photo" : "choose");
  const [photo, setPhoto] = useState(sessionPhoto);
  const [auto, setAuto] = useState<{ items: Placement[]; detected: boolean } | null>(null);
  const [status, setStatus] = useState<"idle" | "detecting" | "placed" | "manual">("idle");
  const [adj, setAdj] = useState<Adjust>(NO_ADJ);
  const [compare, setCompare] = useState(false);

  const [consentOpen, setConsentOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);

  const type = product?.tryOn?.type ?? null;

  /* Load product, asset, AI availability, similar pieces */
  useEffect(() => {
    let alive = true;
    api.get<Product>(`/api/public/products/${slug}`).then(async (p) => {
      if (!alive) return;
      setProduct(p);
      if (!p.tryOn) { setAsset(null); return; }
      preload(p.tryOn.type);
      const src = p.tryOn.assetUrl ?? p.image;
      const a = src ? await prepareAsset(src, !!p.tryOn.assetUrl, p.tryOn.type === "earrings") : null;
      if (alive) setAsset(a);
      api.get<Product[]>(`/api/public/products?limit=60`).then((list) => {
        if (alive) setSimilar(list.filter((x) => x.tryOn?.type === p.tryOn!.type && x.slug !== p.slug && x.image).slice(0, 10));
      }).catch(() => {});
    }).catch(() => { if (alive) { setProduct(null); setAsset(null); } });
    api.get<{ aiRender: boolean }>("/api/ai/try-on/config").then((c) => alive && setAiEnabled(!!c.aiRender)).catch(() => {});
    return () => { alive = false; };
  }, [slug]);

  /* ── Photo → detect & place ── */
  const imgRef = useRef<HTMLImageElement>(null);
  const runImageDetection = useCallback(async () => {
    const img = imgRef.current;
    if (!img || !type) return;
    setStatus("detecting");
    try {
      const lms = await detect(type, img, "IMAGE");
      if (lms) { setAuto({ items: place(type, lms, img.naturalWidth, img.naturalHeight), detected: true }); setStatus("placed"); return; }
    } catch { /* model unavailable (offline) → manual placement */ }
    setAuto({ items: defaults(type), detected: false });
    setStatus("manual");
  }, [type]);

  useEffect(() => { if (phase === "photo" && photo) { setAdj(NO_ADJ); setAuto(null); } }, [phase, photo]);

  async function usePhoto(dataUrl: string, mirror = false) {
    const j = await toJpeg(dataUrl, 1280, mirror);
    sessionPhoto = j;
    setPhoto(j);
    setAiResult(null);
    setPhase("photo");
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast({ title: "Please choose a photo" }); return; }
    const r = new FileReader();
    r.onload = () => usePhoto(String(r.result));
    r.readAsDataURL(f);
  }

  /* ── Live camera ── */
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [videoAspect, setVideoAspect] = useState(3 / 4);
  const smooth = useRef<Placement[] | null>(null);
  const liveSupported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const stopCamera = useCallback(() => { streamRef.current?.getTracks().forEach((tr) => tr.stop()); streamRef.current = null; }, []);
  useEffect(() => stopCamera, [stopCamera]);

  async function startCamera(face: "user" | "environment" = facing) {
    stopCamera();
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: face, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      streamRef.current = s;
      setFacing(face);
      setAdj(NO_ADJ);
      smooth.current = null;
      setPhase("live");
      requestAnimationFrame(() => {
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = s;
        v.onloadedmetadata = () => { setVideoAspect(v.videoWidth / v.videoHeight); v.play().catch(() => {}); };
      });
    } catch {
      toast({ title: "Camera unavailable", body: "Allow camera access, or upload a photo instead." });
    }
  }

  useEffect(() => {
    if (phase !== "live" || !type) return;
    let raf = 0, last = -1, stopped = false;
    setStatus("detecting");
    const loop = async () => {
      if (stopped) return;
      const v = videoRef.current;
      if (v && v.readyState >= 2 && v.currentTime !== last) {
        last = v.currentTime;
        try {
          const lms = await detect(type, v, "VIDEO", performance.now());
          if (lms) {
            smooth.current = lerp(smooth.current, place(type, lms, v.videoWidth, v.videoHeight));
            setAuto({ items: smooth.current, detected: true });
            setStatus("placed");
          } else {
            setStatus((s) => (s === "placed" ? "detecting" : s));
          }
        } catch { setStatus("manual"); setAuto({ items: defaults(type), detected: false }); }
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [phase, type]);

  function capture() {
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext("2d")!;
    if (facing === "user") { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0);
    stopCamera();
    usePhoto(c.toDataURL("image/jpeg", 0.92));
  }

  /* ── Gestures (photo mode): drag to move, pinch to resize/rotate ── */
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; ang: number } | null>(null);
  function pd(e: React.PointerEvent) {
    if (phase !== "photo" || !asset || asset === "loading") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = null;
  }
  function pm(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    const box = stageRef.current?.getBoundingClientRect();
    if (!prev || !box) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      setAdj((a) => ({ ...a, dx: a.dx + (e.clientX - prev.x) / box.width, dy: a.dy + (e.clientY - prev.y) / box.height }));
    } else if (pts.length === 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const ang = (Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * 180) / Math.PI;
      if (pinch.current) {
        const k = dist / pinch.current.dist, da = ang - pinch.current.ang;
        setAdj((a) => ({ ...a, scale: Math.min(3, Math.max(0.3, a.scale * k)), rot: a.rot + da }));
      }
      pinch.current = { dist, ang };
    }
  }
  function pu(e: React.PointerEvent) { pointers.current.delete(e.pointerId); pinch.current = null; }

  /* ── Compose a shareable image (photo + piece + visualization watermark) ── */
  async function compose(): Promise<string | null> {
    if (!photo || !auto || !asset || asset === "loading") return null;
    if (!asset.exportable) { toast({ title: "Saving isn't available for this piece", body: "Take a screenshot instead." }); return null; }
    const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); if (!src.startsWith("data:")) i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const base = await load(photo.url);
    const W = base.naturalWidth, H = base.naturalHeight;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(base, 0, 0);
    const sources = asset.halves ?? [asset.src];
    const imgs = await Promise.all(sources.map(load));
    auto.items.forEach((p, i) => {
      const img = imgs[Math.min(i, imgs.length - 1)];
      const w = p.w * adj.scale * W, h = w / asset.aspect;
      ctx.save();
      ctx.translate((p.cx + adj.dx) * W, (p.cy + adj.dy) * H);
      ctx.rotate(((p.rot + adj.rot) * Math.PI) / 180);
      const mirror = (adj.flip ? -1 : 1) * (i === 1 && !asset.halves ? -1 : 1);
      ctx.scale(mirror, 1);
      ctx.shadowColor = "rgba(0,0,0,.28)"; ctx.shadowBlur = w * 0.03; ctx.shadowOffsetY = w * 0.01;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    });
    watermark(ctx, W, H);
    try { return c.toDataURL("image/jpeg", 0.92); } catch { toast({ title: "Saving isn't available for this piece" }); return null; }
  }

  async function save(url?: string | null) {
    const data = url ?? (await compose());
    if (!data) return;
    const a = document.createElement("a");
    a.href = data; a.download = `aurelia-try-on-${slug}.jpg`;
    document.body.appendChild(a); a.click(); a.remove();
  }
  async function share(url?: string | null) {
    const data = url ?? (await compose());
    if (!data) return;
    const blob = await (await fetch(data)).blob();
    const file = new File([blob], `aurelia-try-on.jpg`, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: product?.name, text: `${product?.name}, a virtual try-on at Aurelia` }).catch(() => {});
    } else {
      save(data);
    }
  }

  /* ── AI render (opt-in, consent required) ── */
  async function runAi() {
    if (!photo || !product) return;
    setConsentOpen(false);
    setAiBusy(true);
    setPhase("ai");
    try {
      const r = await api.post<{ image: string }>("/api/ai/try-on/render", { productId: product.id, photo: photo.url, consent: true });
      setAiResult(r.image);
    } catch (e) {
      toast({ title: "AI render unavailable", body: (e as Error).message });
      setPhase("photo");
    } finally {
      setAiBusy(false);
    }
  }

  function addInquiry() {
    if (!product) return;
    addToCart(product);
    toast({ title: "Added to your inquiry", body: product.name, image: product.image, action: { label: "View bag", to: "/cart" } });
  }

  /* ── Render ── */
  if (product === null && asset !== "loading") {
    return <div className="px-4 py-24 text-center"><div className="font-serif text-[30px] italic">This piece isn't available</div><Link to="/try-on" className="mt-4 inline-block text-[13px] font-semibold underline underline-offset-4">Browse try-on pieces</Link></div>;
  }
  if (!product || asset === "loading") {
    return <div className="px-4 pt-6"><div className="skeleton h-6 w-40 rounded" /><div className="skeleton mt-4 aspect-[3/4] rounded-[22px]" /></div>;
  }
  if (!product.tryOn) {
    return (
      <div className="px-4 py-20 text-center">
        <div className="font-serif text-[28px] italic">Try-on isn't available for this piece</div>
        <p className="mt-2 text-[14px] text-muted-foreground">See it in person at one of our boutiques.</p>
        <LuxuryButton className="mt-6" onClick={() => navigate("/appointments")} icon={<CalendarClock className="size-4" />}>Book a private viewing</LuxuryButton>
      </div>
    );
  }

  const overlayReady = !!asset;
  const canAi = aiEnabled;
  const tType = product.tryOn.type;

  return (
    <div className="px-4 pb-8 pt-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => (phase === "choose" ? navigate(-1) : (stopCamera(), setPhase(photo ? (phase === "ai" ? "photo" : "choose") : "choose")))} className="inline-flex items-center gap-2 text-[13px] font-semibold text-muted-foreground"><ArrowLeft className="size-4" /> Back</button>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-deep"><Sparkles className="size-3.5" /> Virtual try-on</span>
      </div>

      {/* Product strip */}
      <Link to={`/product/${product.slug}`} className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-surface p-2.5 pr-4">
        <img src={product.image ?? ""} alt="" className="size-12 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-serif text-[18px] leading-tight">{product.name}</div>
          <div className="text-[11.5px] text-muted-foreground">{product.karat}K {product.metalColor} · {LABEL[tType]}</div>
        </div>
        <Price priceMode={product.priceMode} basePrice={product.basePrice} discount={product.discount} size="sm" />
      </Link>

      <AnimatePresence mode="wait">
        {/* ── 1. Choose a photo ── */}
        {phase === "choose" && (
          <motion.section key="choose" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45, ease: EASE }} className="mt-6">
            <h1 className="font-serif text-[36px] leading-none">See it on <span className="italic text-brand-deep">you.</span></h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{TIPS[tType]}</p>

            {!overlayReady && !canAi ? (
              <div className="mt-6 rounded-[22px] border border-border bg-surface p-5">
                <div className="font-serif text-[22px] leading-tight">This piece is best seen in person</div>
                <p className="mt-1.5 text-[13px] text-muted-foreground">Its photographs aren't suited to virtual try-on yet. An advisor can prepare it for your visit.</p>
                <LuxuryButton full className="mt-4" onClick={() => navigate("/appointments")} icon={<CalendarClock className="size-4" />}>Book a private viewing</LuxuryButton>
              </div>
            ) : (
              <div className="mt-6 grid gap-3">
                {liveSupported && overlayReady && (
                  <Option icon={<Video className="size-5" />} title="Live camera" desc="See the piece move with you in real time." onClick={() => startCamera(tType === "ring" || tType === "bracelet" ? "environment" : "user")} />
                )}
                <label className="block cursor-pointer">
                  <input type="file" accept="image/*" capture={tType === "ring" || tType === "bracelet" ? "environment" : "user"} className="sr-only" onChange={onFile} />
                  <OptionBody icon={<Camera className="size-5" />} title="Take a photo" desc="Use your phone's camera." />
                </label>
                <label className="block cursor-pointer">
                  <input type="file" accept="image/*" className="sr-only" onChange={onFile} />
                  <OptionBody icon={<ImageUp className="size-5" />} title="Upload a photo" desc="Choose a clear, well-lit photo." />
                </label>
              </div>
            )}

            {!overlayReady && canAi && (
              <p className="mt-3 rounded-xl bg-sand px-3.5 py-2.5 text-[12.5px] text-foreground/80">
                <Wand2 className="mr-1.5 inline size-3.5 text-brand-deep" />This piece is tried on with our AI render. Add your photo, then tap <b>Create AI render</b>.
              </p>
            )}
            <PrivacyNote className="mt-5" />
            <Disclaimer className="mt-2" />
          </motion.section>
        )}

        {/* ── 2. Photo / live stage ── */}
        {(phase === "photo" || phase === "live") && (
          <motion.section key="stage" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: EASE }} className="mt-4">
            <div
              ref={stageRef}
              onPointerDown={pd}
              onPointerMove={pm}
              onPointerUp={pu}
              onPointerCancel={pu}
              className="relative w-full touch-none select-none overflow-hidden rounded-[22px] bg-champagne"
              style={{ aspectRatio: phase === "live" ? `${videoAspect}` : photo ? `${photo.w}/${photo.h}` : "3/4" }}
            >
              <div className="absolute inset-0" style={{ transform: phase === "live" && facing === "user" ? "scaleX(-1)" : undefined }}>
                {phase === "live" ? (
                  <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
                ) : photo && (
                  <img ref={imgRef} src={photo.url} alt="Your photo" draggable={false} onLoad={runImageDetection} className="absolute inset-0 size-full" />
                )}
                {overlayReady && auto && !compare && asset && auto.items.map((p, i) => (
                  <img
                    key={i}
                    src={asset.halves?.[i] ?? asset.src}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute max-w-none"
                    style={{
                      left: `${(p.cx + adj.dx) * 100}%`,
                      top: `${(p.cy + adj.dy) * 100}%`,
                      width: `${p.w * adj.scale * 100}%`,
                      aspectRatio: `${asset.aspect}`,
                      transform: `translate(-50%, -50%) rotate(${p.rot + adj.rot}deg) scaleX(${(adj.flip ? -1 : 1) * (i === 1 && !asset.halves ? -1 : 1)})`,
                      filter: "drop-shadow(0 2px 3px rgba(0,0,0,.28))",
                      transition: phase === "live" ? "none" : "left .5s, top .5s, width .5s",
                    }}
                  />
                ))}
              </div>

              {/* Labels */}
              <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur">Visualization only</span>
              <StatusChip status={status} overlayReady={overlayReady} live={phase === "live"} />

              {phase === "live" && (
                <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-6">
                  <RoundBtn label="Switch camera" onClick={() => startCamera(facing === "user" ? "environment" : "user")}><SwitchCamera className="size-5" /></RoundBtn>
                  <button onClick={capture} aria-label="Capture" className="flex size-[68px] items-center justify-center rounded-full border-4 border-white/90 bg-white/25 backdrop-blur transition active:scale-95">
                    <span className="size-[52px] rounded-full bg-white" />
                  </button>
                  <RoundBtn label="Upload instead" onClick={() => { stopCamera(); setPhase("choose"); }}><ImageUp className="size-5" /></RoundBtn>
                </div>
              )}
            </div>

            {/* Adjust */}
            {phase === "photo" && overlayReady && (
              <div className="mt-4 rounded-[20px] border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold">Adjust the fit</span>
                  <span className="text-[11px] text-muted-foreground">Drag · pinch to resize</span>
                </div>
                <Slider label="Size" min={0.4} max={2.2} step={0.01} value={adj.scale} onChange={(v) => setAdj((a) => ({ ...a, scale: v }))} />
                <Slider label="Angle" min={-45} max={45} step={1} value={adj.rot} onChange={(v) => setAdj((a) => ({ ...a, rot: v }))} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip onClick={() => setAdj((a) => ({ ...a, flip: !a.flip }))}><FlipHorizontal2 className="size-3.5" /> Flip</Chip>
                  <Chip onClick={() => setAdj(NO_ADJ)}><RotateCcw className="size-3.5" /> Reset</Chip>
                  <Chip onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)}>Hold to compare</Chip>
                  <Chip onClick={() => setPhase("choose")}><RefreshCw className="size-3.5" /> New photo</Chip>
                </div>
              </div>
            )}

            {/* Actions */}
            {phase === "photo" && (
              <div className="mt-4 grid gap-2.5">
                {canAi && (
                  <LuxuryButton variant="gold" size="lg" full onClick={() => setConsentOpen(true)} icon={<Wand2 className="size-4" />}>
                    Create realistic AI render
                  </LuxuryButton>
                )}
                {overlayReady && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <LuxuryButton variant="outline" onClick={() => save()} icon={<Download className="size-4" />}>Save</LuxuryButton>
                    <LuxuryButton variant="outline" onClick={() => share()} icon={<Share2 className="size-4" />}>Share</LuxuryButton>
                  </div>
                )}
                <Commerce onInquiry={addInquiry} onBook={() => navigate("/appointments")} />
              </div>
            )}
            <Disclaimer className="mt-3" />
          </motion.section>
        )}

        {/* ── 3. AI render ── */}
        {phase === "ai" && (
          <motion.section key="ai" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: EASE }} className="mt-4">
            <div className="relative overflow-hidden rounded-[22px] bg-champagne" style={{ aspectRatio: aiResult ? "2/3" : photo ? `${photo.w}/${photo.h}` : "3/4" }}>
              {aiResult ? (
                <motion.img initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.2, ease: EASE }} src={aiResult} alt={`AI render of ${product.name}`} className="absolute inset-0 size-full object-cover" />
              ) : (
                <>
                  {photo && <img src={photo.url} alt="" className="absolute inset-0 size-full object-cover opacity-60 blur-[2px]" />}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/40 backdrop-blur-[2px]">
                    <Loader2 className="size-7 animate-spin text-brand-deep" />
                    <div className="font-serif text-[22px]">Crafting your preview…</div>
                    <div className="text-[12px] text-muted-foreground">This usually takes 20–40 seconds</div>
                  </div>
                </>
              )}
              <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur">AI render · Visualization only</span>
            </div>
            {aiResult && !aiBusy && (
              <div className="mt-4 grid gap-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <LuxuryButton variant="outline" onClick={() => save(aiResult)} icon={<Download className="size-4" />}>Save</LuxuryButton>
                  <LuxuryButton variant="outline" onClick={() => share(aiResult)} icon={<Share2 className="size-4" />}>Share</LuxuryButton>
                </div>
                <Commerce onInquiry={addInquiry} onBook={() => navigate("/appointments")} />
                <button onClick={() => setPhase("photo")} className="mt-1 text-[12.5px] font-semibold text-muted-foreground underline underline-offset-4">Back to the try-on</button>
              </div>
            )}
            <Disclaimer className="mt-3" />
          </motion.section>
        )}
      </AnimatePresence>

      {/* Similar pieces — switch without retaking the photo */}
      {similar.length > 0 && phase !== "ai" && (
        <section className="mt-8">
          <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-deep">Try another {LABEL[tType]}</div>
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
            {similar.map((p) => (
              <Link key={p.id} to={`/try-on/${p.slug}`} className="w-[92px] shrink-0">
                <div className="aspect-square overflow-hidden rounded-2xl border border-border bg-champagne"><img src={p.image!} alt="" loading="lazy" className="size-full object-cover" /></div>
                <div className="mt-1.5 line-clamp-2 text-[11.5px] leading-tight">{p.name}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Consent for AI render */}
      <Modal open={consentOpen} onClose={() => setConsentOpen(false)} title="Create an AI render">
        <ConsentBody onAccept={runAi} />
      </Modal>
    </div>
  );
}

/* ───────────────────────── Pieces ───────────────────────── */

function watermark(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const band = Math.max(28, Math.round(H * 0.045));
  ctx.fillStyle = "rgba(46,33,27,0.72)";
  ctx.fillRect(0, H - band, W, band);
  ctx.fillStyle = "#F7E6DA";
  ctx.font = `600 ${Math.round(band * 0.36)}px Manrope, system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText("AURELIA  ·  VIRTUAL TRY-ON  ·  VISUALIZATION ONLY", W / 2, H - band / 2);
}

function ConsentBody({ onAccept }: { onAccept: () => void }) {
  const [ok, setOk] = useState(false);
  return (
    <div>
      <p className="text-[14px] leading-relaxed text-muted-foreground">
        To create a realistic preview, your photo is sent securely to our AI provider. It is used only to make this image and is <b className="text-foreground">not stored</b> by Aurelia.
      </p>
      <label className="mt-4 flex items-start gap-3 text-[13.5px]">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-brand)]" />
        <span>I agree to my photo being processed to create this preview.</span>
      </label>
      <p className="mt-3 text-[12px] text-muted-foreground">{DISCLAIMER}</p>
      <LuxuryButton variant="gold" full size="lg" className="mt-5" disabled={!ok} onClick={onAccept} icon={<Wand2 className="size-4" />}>Create AI render</LuxuryButton>
    </div>
  );
}

function Commerce({ onInquiry, onBook }: { onInquiry: () => void; onBook: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <LuxuryButton onClick={onInquiry} icon={<ShoppingBag className="size-4" />}>Add to inquiry</LuxuryButton>
      <LuxuryButton variant="outline" onClick={onBook} icon={<CalendarClock className="size-4" />}>Book viewing</LuxuryButton>
    </div>
  );
}

function StatusChip({ status, overlayReady, live }: { status: string; overlayReady: boolean; live: boolean }) {
  if (!overlayReady) return null;
  const text = status === "detecting" ? (live ? "Finding you…" : "Placing the piece…") : status === "placed" ? (live ? "Tracking" : "Placed automatically") : status === "manual" ? "Drag to position" : "";
  if (!text) return null;
  return (
    <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-surface/95 px-2.5 py-1 text-[10.5px] font-semibold text-foreground">
      {status === "detecting" ? <Loader2 className="size-3 animate-spin text-brand-deep" /> : <span className={cn("size-1.5 rounded-full", status === "placed" ? "bg-ok" : "bg-brand")} />}
      {text}
    </span>
  );
}

function PrivacyNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground", className)}>
      <Lock className="mt-0.5 size-3.5 shrink-0 text-brand-deep" />
      Your photo stays on this device. It's never uploaded unless you choose an AI render, and it's never stored.
    </p>
  );
}

function Disclaimer({ className }: { className?: string }) {
  return <p className={cn("text-[11.5px] italic leading-relaxed text-muted-foreground", className)}>{DISCLAIMER}</p>;
}

function Option({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return <button onClick={onClick} className="block w-full text-left"><OptionBody icon={icon} title={title} desc={desc} /></button>;
}
function OptionBody({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <span className="flex items-center gap-3.5 rounded-[20px] border border-border bg-surface p-4 transition-colors duration-300 hover:border-brand/50">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-champagne text-brand-deep">{icon}</span>
      <span className="flex-1">
        <span className="block font-serif text-[20px] leading-tight">{title}</span>
        <span className="block text-[12.5px] text-muted-foreground">{desc}</span>
      </span>
    </span>
  );
}

function Slider({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="mt-3 flex items-center gap-3 text-[12px] text-muted-foreground">
      <span className="w-11">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-[var(--color-brand)]" />
    </label>
  );
}

function Chip({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...rest} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold text-foreground/80 transition hover:border-foreground/40 hover:text-foreground">{children}</button>;
}

function RoundBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button aria-label={label} title={label} onClick={onClick} className="flex size-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition active:scale-95">{children}</button>;
}
