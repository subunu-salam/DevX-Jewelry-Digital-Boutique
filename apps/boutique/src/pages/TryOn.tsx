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
import { LABEL, TIPS, defaults, detect, lerp, needs, place, preload, type FitSpec, type Placement, type TryOnType } from "@/lib/tryon/engine";
import { assetFor, toJpeg, type Asset } from "@/lib/tryon/asset";

const DISCLAIMER = "Virtual try-on is a visualization only. Size, fit, colour and sparkle may differ from the actual piece.";

/** The customer's photo is kept in memory only for this visit, so they can try several pieces. */
let sessionPhoto: { url: string; w: number; h: number } | null = null;

interface Adjust { dx: number; dy: number; scale: number; rot: number; flip: boolean }
const NO_ADJ: Adjust = { dx: 0, dy: 0, scale: 1, rot: 0, flip: false };

export default function TryOn() {
  const { slug } = useParams();
  // No key: switching pieces keeps the camera and photo running.
  return slug ? <Studio slug={slug} /> : <Picker />;
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
const assetCache = new Map<string, Promise<Asset | null>>();
const getAsset = (p: Product) => {
  if (!assetCache.has(p.slug)) assetCache.set(p.slug, assetFor(p).catch(() => null));
  return assetCache.get(p.slug)!;
};

function Studio({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { addToCart } = useStore();

  const [catalog, setCatalog] = useState<Product[]>([]);
  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [asset, setAsset] = useState<Asset | null | "loading">("loading");
  const [aiEnabled, setAiEnabled] = useState(false);

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
  const fit: FitSpec | null = asset && asset !== "loading" ? { ...asset.fit, aspect: asset.aspect } : null;
  const typeRef = useRef(type); typeRef.current = type;
  const fitRef = useRef(fit); fitRef.current = fit;

  /* Catalogue of try-on pieces + AI availability (once) */
  useEffect(() => {
    api.get<Product[]>("/api/public/products?limit=80").then((l) => setCatalog(l.filter((p) => p.tryOn))).catch(() => {});
    api.get<{ aiRender: boolean }>("/api/ai/try-on/config").then((c) => setAiEnabled(!!c.aiRender)).catch(() => {});
  }, []);

  /* Current piece: show instantly from the catalogue, then load full detail + overlay */
  useEffect(() => {
    let alive = true;
    const quick = catalog.find((p) => p.slug === slug);
    if (quick) setProduct(quick);
    setAsset("loading");
    setAiResult(null);
    api.get<Product>(`/api/public/products/${slug}`).then(async (p) => {
      if (!alive) return;
      setProduct(p);
      if (!p.tryOn) { setAsset(null); return; }
      preload(p.tryOn.type);
      const a = await getAsset(p);
      if (alive) setAsset(a);
    }).catch(() => { if (alive) { setProduct(null); setAsset(null); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  /* ── Photo: detect once, re-place whenever the piece changes ── */
  const imgRef = useRef<HTMLImageElement>(null);
  const lmsRef = useRef<{ kind: "face" | "hand"; pts: { x: number; y: number }[] | null; W: number; H: number } | null>(null);

  const detectPhoto = useCallback(async () => {
    const img = imgRef.current, t = typeRef.current, f = fitRef.current;
    if (!img || !t || !f || !img.naturalWidth) return;
    setStatus("detecting");
    const kind = needs(t);
    let pts: { x: number; y: number }[] | null = null;
    try { pts = await detect(t, img, "IMAGE"); } catch { /* model unavailable → manual placement */ }
    lmsRef.current = { kind, pts, W: img.naturalWidth, H: img.naturalHeight };
    if (pts) { setAuto({ items: place(t, pts, img.naturalWidth, img.naturalHeight, f), detected: true }); setStatus("placed"); }
    else { setAuto({ items: defaults(t), detected: false }); setStatus("manual"); }
  }, []);

  useEffect(() => {
    if (phase !== "photo" || !type || !fit) return;
    const l = lmsRef.current;
    if (l && l.kind === needs(type)) {
      if (l.pts) { setAuto({ items: place(type, l.pts, l.W, l.H, fit), detected: true }); setStatus("placed"); }
      else { setAuto({ items: defaults(type), detected: false }); setStatus("manual"); }
    } else {
      detectPhoto();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, type, asset]);

  async function usePhoto(dataUrl: string) {
    const j = await toJpeg(dataUrl, 1280);
    sessionPhoto = j;
    lmsRef.current = null;
    setAuto(null);
    setAdj(NO_ADJ);
    setPhoto(j);
    setAiResult(null);
    setPhase("photo");
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast({ title: "Please choose a photo" }); return; }
    const r = new FileReader();
    r.onload = () => usePhoto(String(r.result));
    r.readAsDataURL(file);
  }

  /* ── Live camera ── */
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [videoAspect, setVideoAspect] = useState(3 / 4);
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
      setAuto(null);
      setPhase("live");
      requestAnimationFrame(() => {
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = s;
        v.onloadedmetadata = () => { setVideoAspect(v.videoWidth / v.videoHeight); v.play().catch(() => {}); };
      });
    } catch {
      toast({ title: "Camera unavailable", body: "Allow camera access in your browser, or upload a photo instead." });
    }
  }

  useEffect(() => {
    if (phase !== "live") return;
    let raf = 0, last = -1, stopped = false;
    let smooth: Placement[] | null = null, smoothKey = "";
    setStatus("detecting");
    const loop = async () => {
      if (stopped) return;
      const v = videoRef.current, t = typeRef.current, f = fitRef.current;
      if (v && t && f && v.readyState >= 2 && v.currentTime !== last) {
        last = v.currentTime;
        try {
          const pts = await detect(t, v, "VIDEO", performance.now());
          if (pts && !stopped) {
            const key = `${t}:${f.anchor}:${f.k}:${f.aspect}`;
            const next = place(t, pts, v.videoWidth, v.videoHeight, f);
            smooth = key === smoothKey ? lerp(smooth, next) : next;
            smoothKey = key;
            setAuto({ items: smooth, detected: true });
            setStatus("placed");
          } else if (!stopped) {
            setStatus((s) => (s === "placed" ? "detecting" : s));
          }
        } catch {
          setStatus("manual");
          setAuto({ items: defaults(t), detected: false });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [phase]);

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

  /* ── Gestures (photo): drag to move, pinch to resize/rotate ── */
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; ang: number } | null>(null);
  const editable = phase === "photo" && !!asset && asset !== "loading";
  function pd(e: React.PointerEvent) {
    if (!editable) return;
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
      const angle = (Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * 180) / Math.PI;
      if (pinch.current) {
        const k = dist / pinch.current.dist, da = angle - pinch.current.ang;
        setAdj((a) => ({ ...a, scale: Math.min(3, Math.max(0.3, a.scale * k)), rot: a.rot + da }));
      }
      pinch.current = { dist, ang: angle };
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
    const imgs = await Promise.all((asset.halves ?? [asset.src]).map(load));
    auto.items.forEach((p, i) => {
      const img = imgs[Math.min(i, imgs.length - 1)];
      const w = p.w * adj.scale * W, h = w / asset.aspect;
      ctx.save();
      ctx.translate((p.cx + adj.dx) * W, (p.cy + adj.dy) * H);
      ctx.rotate(((p.rot + adj.rot) * Math.PI) / 180);
      ctx.scale((adj.flip ? -1 : 1) * (i === 1 && !asset.halves ? -1 : 1), 1);
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
    const file = new File([blob], "aurelia-try-on.jpg", { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) navigator.share({ files: [file], title: product?.name, text: `${product?.name}, a virtual try-on at Aurelia` }).catch(() => {});
    else save(data);
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
    } finally { setAiBusy(false); }
  }

  function addInquiry() {
    if (!product) return;
    addToCart(product);
    toast({ title: "Added to your inquiry", body: product.name, image: product.image, action: { label: "View bag", to: "/cart" } });
  }
  const pick = (p: Product) => { if (p.slug !== slug) navigate(`/try-on/${p.slug}`, { replace: true }); };

  /* ── Render ── */
  if (product === null) {
    return <div className="px-4 py-24 text-center"><div className="font-serif text-[30px] italic">This piece isn't available</div><Link to="/try-on" className="mt-4 inline-block text-[13px] font-semibold underline underline-offset-4">Browse try-on pieces</Link></div>;
  }
  if (!product) return <div className="px-4 pt-6"><div className="skeleton h-6 w-40 rounded" /><div className="skeleton mt-4 aspect-[3/4] rounded-[22px]" /></div>;
  if (!product.tryOn) {
    return (
      <div className="px-4 py-20 text-center">
        <div className="font-serif text-[28px] italic">Try-on isn't available for this piece</div>
        <p className="mt-2 text-[14px] text-muted-foreground">See it in person at one of our boutiques.</p>
        <LuxuryButton className="mt-6" onClick={() => navigate("/appointments")} icon={<CalendarClock className="size-4" />}>Book a private viewing</LuxuryButton>
      </div>
    );
  }

  const tType = product.tryOn.type;
  const ready = !!asset && asset !== "loading";
  const handFirst = tType === "ring" || tType === "bracelet";
  const rail = <PieceRail items={catalog} current={product.slug} onPick={pick} />;

  return (
    <div className="px-4 pb-8 pt-3">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => {
            if (phase === "choose") navigate(-1);
            else if (phase === "ai") setPhase("photo");
            else { stopCamera(); setPhase("choose"); }
          }}
          className="inline-flex items-center gap-2 text-[13px] font-semibold text-muted-foreground"
        ><ArrowLeft className="size-4" /> Back</button>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-deep"><Sparkles className="size-3.5" /> Virtual try-on</span>
      </div>

      {/* Current piece */}
      <Link to={`/product/${product.slug}`} className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-surface p-2.5 pr-4">
        <img src={product.image ?? ""} alt="" className="size-12 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-serif text-[18px] leading-tight">{product.name}</div>
          <div className="text-[11.5px] text-muted-foreground">{product.karat}K {product.metalColor} · {LABEL[tType]}</div>
        </div>
        <Price priceMode={product.priceMode} basePrice={product.basePrice} discount={product.discount} size="sm" />
      </Link>

      <AnimatePresence mode="wait">
        {/* ── 1. Start ── */}
        {phase === "choose" && (
          <motion.section key="choose" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45, ease: EASE }} className="mt-6">
            <h1 className="font-serif text-[38px] leading-none">See it on <span className="italic text-brand-deep">you.</span></h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{TIPS[tType]}</p>

            <div className="mt-6 grid gap-3">
              {liveSupported && (
                <LuxuryButton variant="gold" size="lg" full onClick={() => startCamera(handFirst ? "environment" : "user")} icon={<Video className="size-4" />}>
                  Start live try-on
                </LuxuryButton>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="block cursor-pointer">
                  <input type="file" accept="image/*" capture={handFirst ? "environment" : "user"} className="sr-only" onChange={onFile} />
                  <OptionBody icon={<Camera className="size-5" />} title="Take a photo" desc="With your camera" />
                </label>
                <label className="block cursor-pointer">
                  <input type="file" accept="image/*" className="sr-only" onChange={onFile} />
                  <OptionBody icon={<ImageUp className="size-5" />} title="Upload" desc="A clear, lit photo" />
                </label>
              </div>
            </div>

            <div className="mt-7">{rail}</div>
            <PrivacyNote className="mt-5" />
            <Disclaimer className="mt-2" />
          </motion.section>
        )}

        {/* ── 2. Live / photo stage ── */}
        {(phase === "photo" || phase === "live") && (
          <motion.section key="stage" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: EASE }} className="mt-4">
            <div
              ref={stageRef}
              onPointerDown={pd}
              onPointerMove={pm}
              onPointerUp={pu}
              onPointerCancel={pu}
              className="relative w-full touch-none select-none overflow-hidden rounded-[22px] bg-night"
              style={{ aspectRatio: phase === "live" ? `${videoAspect}` : photo ? `${photo.w}/${photo.h}` : "3/4" }}
            >
              <div className="absolute inset-0" style={{ transform: phase === "live" && facing === "user" ? "scaleX(-1)" : undefined }}>
                {phase === "live" ? (
                  <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
                ) : photo && (
                  <img ref={imgRef} src={photo.url} alt="Your photo" draggable={false} onLoad={() => { lmsRef.current = null; detectPhoto(); }} className="absolute inset-0 size-full" />
                )}
                <AnimatePresence>
                  {ready && auto && !compare && asset && auto.items.map((p, i) => (
                    <motion.img
                      key={`${asset.src.slice(-24)}-${i}`}
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35, ease: EASE }}
                      src={asset.halves?.[i] ?? asset.src}
                      alt=""
                      draggable={false}
                      className="pointer-events-none absolute max-w-none"
                      style={{
                        left: `${(p.cx + adj.dx) * 100}%`,
                        top: `${(p.cy + adj.dy) * 100}%`,
                        width: `${p.w * adj.scale * 100}%`,
                        aspectRatio: `${asset.aspect}`,
                        x: "-50%", y: "-50%",
                        rotate: p.rot + adj.rot,
                        scaleX: (adj.flip ? -1 : 1) * (i === 1 && !asset.halves ? -1 : 1),
                        filter: "drop-shadow(0 2px 3px rgba(0,0,0,.3))",
                      }}
                    />
                  ))}
                </AnimatePresence>
              </div>

              <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur">Visualization only</span>
              {asset === "loading" ? (
                <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-surface/95 px-2.5 py-1 text-[10.5px] font-semibold"><Loader2 className="size-3 animate-spin text-brand-deep" /> Preparing piece…</span>
              ) : <StatusChip status={status} overlayReady={ready} live={phase === "live"} />}
              {ready && asset.source === "likeness" && (
                <span className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-medium text-white/90 backdrop-blur" style={{ bottom: phase === "live" ? 96 : 12 }}>Rendered likeness</span>
              )}

              {phase === "live" && (
                <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-6">
                  <RoundBtn label="Switch camera" onClick={() => startCamera(facing === "user" ? "environment" : "user")}><SwitchCamera className="size-5" /></RoundBtn>
                  <button onClick={capture} aria-label="Capture" className="flex size-[68px] items-center justify-center rounded-full border-4 border-white/90 bg-white/25 backdrop-blur transition active:scale-95">
                    <span className="size-[52px] rounded-full bg-white" />
                  </button>
                  <RoundBtn label="Upload a photo instead" onClick={() => { stopCamera(); setPhase("choose"); }}><ImageUp className="size-5" /></RoundBtn>
                </div>
              )}
            </div>

            {/* Switch pieces without leaving the camera */}
            <div className="mt-4">{rail}</div>

            {/* Adjust */}
            {ready && (
              <div className="mt-4 rounded-[20px] border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold">Adjust the fit</span>
                  <span className="text-[11px] text-muted-foreground">{phase === "photo" ? "Drag · pinch to resize" : "Follows you automatically"}</span>
                </div>
                <Slider label="Size" min={0.5} max={1.8} step={0.01} value={adj.scale} onChange={(v) => setAdj((a) => ({ ...a, scale: v }))} />
                <Slider label="Angle" min={-30} max={30} step={1} value={adj.rot} onChange={(v) => setAdj((a) => ({ ...a, rot: v }))} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip onClick={() => setAdj(NO_ADJ)}><RotateCcw className="size-3.5" /> Reset</Chip>
                  <Chip onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)}>Hold to compare</Chip>
                  {phase === "photo" && <Chip onClick={() => setAdj((a) => ({ ...a, flip: !a.flip }))}><FlipHorizontal2 className="size-3.5" /> Flip</Chip>}
                  {phase === "photo" && liveSupported && <Chip onClick={() => startCamera(handFirst ? "environment" : "user")}><Video className="size-3.5" /> Go live</Chip>}
                  {phase === "photo" && <Chip onClick={() => setPhase("choose")}><RefreshCw className="size-3.5" /> New photo</Chip>}
                </div>
              </div>
            )}

            {phase === "photo" && (
              <div className="mt-4 grid gap-2.5">
                {aiEnabled && (
                  <LuxuryButton variant="gold" size="lg" full onClick={() => setConsentOpen(true)} icon={<Wand2 className="size-4" />}>Create realistic AI render</LuxuryButton>
                )}
                <div className="grid grid-cols-2 gap-2.5">
                  <LuxuryButton variant="outline" onClick={() => save()} icon={<Download className="size-4" />}>Save</LuxuryButton>
                  <LuxuryButton variant="outline" onClick={() => share()} icon={<Share2 className="size-4" />}>Share</LuxuryButton>
                </div>
                <Commerce onInquiry={addInquiry} onBook={() => navigate("/appointments")} />
              </div>
            )}
            {phase === "live" && (
              <div className="mt-4"><Commerce onInquiry={addInquiry} onBook={() => navigate("/appointments")} /></div>
            )}
            {ready && asset.source === "likeness" && (
              <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
                Shown as a rendered likeness of {product.name}.{aiEnabled ? " For a photo-real preview, use the AI render." : " See the real piece at any of our boutiques."}
              </p>
            )}
            <Disclaimer className="mt-2" />
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

      <Modal open={consentOpen} onClose={() => setConsentOpen(false)} title="Create an AI render">
        <ConsentBody onAccept={runAi} />
      </Modal>
    </div>
  );
}

/** Horizontal rail of try-on pieces with type filters; tapping swaps the piece instantly. */
function PieceRail({ items, current, onPick }: { items: Product[]; current: string; onPick: (p: Product) => void }) {
  const currentType = items.find((p) => p.slug === current)?.tryOn?.type;
  const [filter, setFilter] = useState<TryOnType | "all">("all");
  const types = useMemo(() => Array.from(new Set(items.map((p) => p.tryOn!.type))), [items]);
  const shown = items.filter((p) => filter === "all" || p.tryOn!.type === filter);
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = railRef.current?.querySelector<HTMLElement>(`[data-slug="${current}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [current, filter]);
  if (!items.length) return null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-deep">Try another piece</span>
      </div>
      <div className="no-scrollbar -mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4">
        {(["all", ...types] as const).map((k) => (
          <button key={k} onClick={() => setFilter(k)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold capitalize transition-colors", filter === k ? "border-ink bg-ink text-on-ink" : "border-border bg-surface text-foreground/70", k === currentType && filter !== k && "border-brand/50")}>
            {k === "all" ? "All" : k === "earrings" ? "Earrings" : `${LABEL[k]}s`}
          </button>
        ))}
      </div>
      <div ref={railRef} className="no-scrollbar -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1">
        {shown.map((p) => {
          const on = p.slug === current;
          return (
            <button key={p.id} data-slug={p.slug} onClick={() => onPick(p)} className="w-[76px] shrink-0 text-left" aria-pressed={on}>
              <span className={cn("block aspect-square overflow-hidden rounded-2xl border-2 bg-champagne transition-all duration-300", on ? "border-brand shadow-[0_8px_20px_-10px_rgba(169,131,76,.9)]" : "border-transparent")}>
                {p.image && <img src={p.image} alt="" loading="lazy" className={cn("size-full object-cover transition-transform duration-500", on && "scale-105")} />}
              </span>
              <span className={cn("mt-1.5 line-clamp-2 block text-[11px] leading-tight", on ? "font-semibold text-foreground" : "text-muted-foreground")}>{p.name}</span>
            </button>
          );
        })}
      </div>
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
