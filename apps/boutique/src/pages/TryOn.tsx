import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft, ArrowRight, Camera, CalendarClock, ChevronsLeftRight, Download, FlipHorizontal2, ImageUp, Loader2, Lock, RefreshCw,
  RotateCcw, ScanFace, Share2, ShoppingBag, Sparkles, SwitchCamera, Video, Wand2,
} from "lucide-react";
import { cn } from "@ui";
import { api } from "@/lib/api";
import type { Product } from "@/lib/types";
import { API_URL } from "@/lib/api";
import { useStore } from "@/context/store";
import { EASE, JewelImage, LuxuryButton, Modal, Price, t, useToast } from "@/design";
import { LABEL, TIPS, defaults, detect, needs, place, preload, smoother, swing, type FitSpec, type Placement, type TryOnType } from "@/lib/tryon/engine";
import { assetFor, toJpeg, type Asset } from "@/lib/tryon/asset";
import { METALS, specFromProduct, type Metal } from "@/lib/jewel3d/spec";
import { DEFAULT_FIT, type Fit } from "@/lib/jewel3d/ar";
import type { LiveState, LiveTryOn } from "@/lib/tryon/live";

const DISCLAIMER = "Virtual try-on is a visualization only. Size, fit, colour and sparkle may differ from the actual piece.";

/** The customer's photo is kept in memory only for this visit, so they can try several pieces. */
let sessionPhoto: { url: string; w: number; h: number } | null = null;

/** One-tap sample portraits so a customer can preview a piece before using their own photo. */
const STUDIO_MODELS = [
  { id: "front", label: "Front", desc: "Earrings · necklaces", src: "/studio/model-front.jpg", hand: false },
  { id: "angled", label: "Three-quarter", desc: "Drops · pendants", src: "/studio/model-angled.jpg", hand: false },
  { id: "hand", label: "Hand", desc: "Rings · bracelets", src: "/studio/model-hand.jpg", hand: true },
] as const;

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
    <div className="px-4 pb-8 pt-4">
      <Link to="/ai" className="inline-flex items-center gap-2 text-[13px] font-semibold text-muted-foreground"><ArrowLeft className="size-4" /> AI Studio</Link>

      {/* Editorial masthead */}
      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={t(0.8)} className="relative mt-4 overflow-hidden rounded-[26px] bg-night text-on-night">
        <img src="/studio/model-front.jpg" alt="" aria-hidden className="absolute inset-y-0 right-0 h-full w-[58%] object-cover object-[50%_20%] opacity-80" style={{ maskImage: "linear-gradient(to left, #000 45%, transparent)", WebkitMaskImage: "linear-gradient(to left, #000 45%, transparent)" }} />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent" />
        <div className="relative px-5 pb-6 pt-8">
          <div className="flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.32em] text-brand-soft"><span className="h-px w-6 bg-brand" /> Virtual fitting room</div>
          <h1 className="mt-3 max-w-[62%] font-serif text-[42px] leading-[0.95]">Envisioned <span className="italic text-brand-soft">on you.</span></h1>
          <p className="mt-3 max-w-[60%] text-[13px] leading-relaxed text-on-night/70">Live camera, your photo or a studio model — every piece is placed and scaled to you in real time.</p>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-on-night/15 bg-on-night/5 px-3 py-1.5 text-[11px] font-semibold backdrop-blur">
            <Lock className="size-3 text-brand-soft" /> Runs on your device
          </div>
        </div>
      </motion.header>

      {/* How it works */}
      <ol className="mt-5 grid grid-cols-3 gap-2.5">
        {[
          { n: "01", t: "Choose", d: "Pick a piece below" },
          { n: "02", t: "Frame", d: "Camera, photo or model" },
          { n: "03", t: "Compare", d: "Switch, slide, save" },
        ].map((s) => (
          <li key={s.n} className="rounded-[18px] border border-border bg-surface p-3">
            <span className="font-serif text-[22px] leading-none text-brand-deep">{s.n}</span>
            <span className="mt-1.5 block text-[12.5px] font-semibold">{s.t}</span>
            <span className="block text-[11px] leading-snug text-muted-foreground">{s.d}</span>
          </li>
        ))}
      </ol>

      <div className="mt-7 flex items-baseline justify-between">
        <h2 className="font-serif text-[26px] leading-none">Ready to try</h2>
        <span className="text-[12px] tabular-nums text-muted-foreground">{items ? `${shown.length} ${shown.length === 1 ? "piece" : "pieces"}` : "…"}</span>
      </div>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
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
                <JewelImage src={p.image} piece={p} alt={p.name} loading="lazy" className="transition-transform duration-[1200ms] ease-[var(--ease-lux)] group-hover:scale-105" />
                <span className="absolute left-2.5 top-2.5 rounded-full bg-ink/80 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-on-ink backdrop-blur">{LABEL[p.tryOn!.type]}</span>
                <span className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-between rounded-full bg-surface/95 py-1.5 pl-3 pr-1.5 text-[11.5px] font-semibold text-foreground shadow-sm backdrop-blur">
                  <span className="inline-flex items-center gap-1.5"><Sparkles className="size-3.5 text-brand-deep" /> Try on</span>
                  <span className="flex size-6 items-center justify-center rounded-full bg-ink text-on-ink transition-transform duration-500 group-hover:translate-x-0.5"><ArrowRight className="size-3.5" /></span>
                </span>
              </div>
              <div className="mt-2.5 text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">{p.karat}K {p.metalColor}</div>
              <div className="mt-0.5 font-serif text-[17px] leading-tight">{p.name}</div>
              <Price priceMode={p.priceMode} basePrice={p.basePrice} discount={p.discount} size="sm" />
            </Link>
          </motion.div>
        ))}
      </div>
      {items && shown.length === 0 && <p className="mt-10 text-center text-muted-foreground">No pieces are set up for try-on yet.</p>}
      <Disclaimer className="mt-8 text-center" />
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
  /** Before/after split position in % (null = off). Photo mode only. */
  const [split, setSplit] = useState<number | null>(null);
  const [modelBusy, setModelBusy] = useState<string | null>(null);
  /** Scene brightness (live camera) so the metal isn't glowing in a dim room. */
  const [light, setLight] = useState(1);
  /** 3D AR for every piece: rings/bracelets on the hand, earrings on the lobes, necklaces at the neck. */
  const spec3d = useMemo(() => (product ? specFromProduct(product) : null), [product]);
  const [use3d, setUse3d] = useState(true);
  const can3d = !!spec3d && !!product?.tryOn;
  const show3d = can3d && use3d && (phase === "live" || phase === "photo");
  const show3dRef = useRef(show3d); show3dRef.current = show3d;
  /* 3D session (tracking + guided scan + renderer) and its controls */
  const [arCanvas, setArCanvas] = useState<HTMLCanvasElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const liveRef = useRef<LiveTryOn | null>(null);
  const [ls, setLs] = useState<LiveState | null>(null);
  const fit3 = useRef<Fit>({ ...DEFAULT_FIT });
  const [fitUi, setFitUi] = useState<Fit>(fit3.current);
  const [flip, setFlip] = useState(false);
  const [metal3, setMetal3] = useState<Metal | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

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
  const lmsRef = useRef<{ kind: string; pts: { x: number; y: number }[] | null; W: number; H: number } | null>(null);

  /*
   * 3D try-on session — metric face/hand tracking, guided scan, real 3D piece with occluders.
   * Runs for both the live camera and an uploaded photo; recreated when the piece or the
   * source changes (the scan result is kept for the whole visit).
   */
  const spec3dKey = spec3d ? JSON.stringify(spec3d) : "";
  const source3d = phase === "live" ? videoEl : phase === "photo" ? imgEl : null;
  useEffect(() => {
    if (!show3d || !spec3d || !arCanvas || !source3d) return;
    let alive = true;
    let sess: LiveTryOn | null = null;
    const model = product?.model3d;
    Promise.all([
      import("@/lib/tryon/live"),
      // the piece's real 3D model (CAD upload or Photo → 3D) when it has one, else the generated piece
      model ? import("@/lib/jewel3d/custom").then(({ loadProductModel }) => loadProductModel(model, API_URL, spec3d)).catch(() => null) : Promise.resolve(null),
    ]).then(([{ LiveTryOn }, jewel]) => {
      if (!alive) return;
      try {
        sess = new LiveTryOn(arCanvas, (s) => { if (!alive) return; setLs(s); if (s.note) setNote(s.note); });
        sess.fit = fit3.current;
        sess.flip = flip;
        sess.setPiece(spec3d, jewel);
        if (metal3) sess.setMetal(metal3);
        liveRef.current = sess;
        void sess.attach(source3d, phase === "photo");
      } catch { setUse3d(false); }
    }).catch(() => setUse3d(false));
    return () => { alive = false; sess?.dispose(); if (liveRef.current === sess) liveRef.current = null; setLs(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show3d, spec3dKey, product?.model3d, arCanvas, source3d, phase, photo?.url]);
  useEffect(() => { if (liveRef.current) liveRef.current.flip = flip; }, [flip]);
  useEffect(() => { if (note) { const id = setTimeout(() => setNote(null), 3200); return () => clearTimeout(id); } }, [note]);
  useEffect(() => { setMetal3(null); }, [slug]);
  const setFit = (k: keyof Fit, v: number) => { fit3.current[k] = v; setFitUi({ ...fit3.current }); };
  const resetFit = () => { Object.assign(fit3.current, DEFAULT_FIT); setFitUi({ ...fit3.current }); };
  const pickMetal = (m: Metal) => { setMetal3(m); liveRef.current?.setMetal(m); };

  const detectPhoto = useCallback(async () => {
    const img = imgRef.current, t = typeRef.current, f = fitRef.current;
    if (show3dRef.current) return; // the 3D session does its own tracking
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
    if (phase !== "photo" || !type || !fit || show3d) return;
    const l = lmsRef.current;
    if (l && l.kind === needs(type)) {
      if (l.pts) { setAuto({ items: place(type, l.pts, l.W, l.H, fit), detected: true }); setStatus("placed"); }
      else { setAuto({ items: defaults(type), detected: false }); setStatus("manual"); }
    } else {
      detectPhoto();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, type, asset, show3d]);

  async function usePhoto(dataUrl: string) {
    const j = await toJpeg(dataUrl, 1280);
    sessionPhoto = j;
    lmsRef.current = null;
    setAuto(null);
    setAdj(NO_ADJ);
    setPhoto(j);
    setAiResult(null);
    setSplit(null);
    setPhase("photo");
  }
  async function loadModel(id: string, src: string) {
    setModelBusy(id);
    try {
      const blob = await fetch(src).then((r) => { if (!r.ok) throw new Error(); return r.blob(); });
      const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob); });
      await usePhoto(url);
    } catch { toast({ title: "Couldn't load the studio model" }); }
    finally { setModelBusy(null); }
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [videoAspect, setVideoAspect] = useState(3 / 4);
  const liveSupported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const stopCamera = useCallback(() => { streamRef.current?.getTracks().forEach((tr) => tr.stop()); streamRef.current = null; }, []);

  /** Connect the camera stream whenever the <video> element mounts (after the page transition). */
  const attachVideo = useCallback((v: HTMLVideoElement | null) => {
    videoRef.current = v;
    setVideoEl(v);
    const s = streamRef.current;
    if (!v || !s || v.srcObject === s) return;
    v.srcObject = s;
    v.muted = true;
    v.setAttribute("playsinline", "true");
    const ready = () => { if (v.videoWidth) setVideoAspect(v.videoWidth / v.videoHeight); v.play().catch(() => {}); };
    v.onloadedmetadata = ready;
    if (v.readyState >= 1) ready();
  }, []);
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
      attachVideo(videoRef.current); // if already mounted (e.g. switching camera)
    } catch {
      toast({ title: "Camera unavailable", body: "Allow camera access in your browser, or upload a photo instead." });
    }
  }

  useEffect(() => {
    if (phase !== "live" || show3d) return; // 3D has its own tracker (lib/tryon/live)
    let raf = 0, last = -1, stopped = false;
    let smoothKey = "", smooth = smoother(), frames = 0;
    // Earring sway: a damped pendulum driven by how fast the head moves sideways.
    let sway: { a: number; w: number; px: number }[] = [], lastT = performance.now() / 1000;
    const probe = document.createElement("canvas"); probe.width = 32; probe.height = 24;
    const pctx = probe.getContext("2d", { willReadFrequently: true });
    setStatus("detecting");
    const loop = async () => {
      if (stopped) return;
      const v = videoRef.current, t = typeRef.current, f = fitRef.current;
      if (v && t && f && v.readyState >= 2 && v.currentTime !== last) {
        last = v.currentTime;
        const now = performance.now() / 1000, dt = Math.min(0.1, Math.max(0.001, now - lastT)); lastT = now;
        // Sample scene brightness a few times a second.
        if (pctx && frames++ % 12 === 0) {
          try {
            pctx.drawImage(v, 0, 0, 32, 24);
            const px = pctx.getImageData(8, 4, 16, 16).data;
            let y = 0; for (let i = 0; i < px.length; i += 4) y += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
            const lum = y / (px.length / 4) / 255;
            setLight((l) => l + (Math.min(1.12, Math.max(0.68, 0.55 + lum * 0.9)) - l) * 0.4);
          } catch { /* ignore */ }
        }
        try {
          const pts = await detect(t, v, "VIDEO", performance.now());
          if (pts && !stopped) {
            const key = `${t}:${f.anchor}:${f.k}:${f.aspect}:${f.widthMm ?? ""}`;
            if (key !== smoothKey) { smooth = smoother(); sway = []; smoothKey = key; }
            let items = smooth(place(t, pts, v.videoWidth, v.videoHeight, f), now);
            if (t === "earrings" || t === "pendant") {
              items = items.map((p, i) => {
                const s0 = (sway[i] ??= { a: 0, w: 0, px: p.cx });
                const vx = (p.cx - s0.px) / dt; s0.px = p.cx;
                // spring back (k), damping (c), and a kick from sideways head motion
                const acc = -90 * s0.a - 7 * s0.w - vx * 900;
                s0.w += acc * dt; s0.a = Math.max(-18, Math.min(18, s0.a + s0.w * dt));
                return swing(p, s0.a, v.videoWidth, v.videoHeight, f.aspect);
              });
            }
            setAuto({ items, detected: true });
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
  }, [phase, show3d]);

  function capture() {
    const v = videoRef.current;
    if (!v) return;
    if (show3d && liveRef.current && product) {
      // keep the camera running; show the composited photo (camera + 3D piece) in a sheet
      const url = liveRef.current.capture(facing === "user", product.name);
      if (url) { setShot(url); return; }
    }
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
  const editable = phase === "photo" && !!asset && asset !== "loading" && !show3d;
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
    if (!photo) return null;
    if (show3d && liveRef.current) return liveRef.current.capture(false, product?.name ?? "");
    if (!auto || !asset || asset === "loading") return null;
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
      ctx.globalAlpha = p.op ?? 1;
      ctx.shadowColor = "rgba(40,20,10,.32)"; ctx.shadowBlur = w * 0.03; ctx.shadowOffsetY = w * 0.012;
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
        <span className="size-12 shrink-0 overflow-hidden rounded-xl"><JewelImage src={product.image} piece={product} alt="" /></span>
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

            <div className="mt-6">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-deep">Or preview on a studio model</span>
                <span className="text-[11px] text-muted-foreground">One tap · no camera</span>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2.5">
                {[...STUDIO_MODELS].sort((a, b) => Number(b.hand === handFirst) - Number(a.hand === handFirst)).map((m) => {
                  const fits = m.hand === handFirst;
                  return (
                    <button key={m.id} onClick={() => loadModel(m.id, m.src)} disabled={!!modelBusy} className={cn("group relative block overflow-hidden rounded-[18px] bg-night text-left transition", !fits && "opacity-60")}>
                      <img src={m.src} alt="" loading="lazy" className="aspect-[3/4] w-full object-cover transition-transform duration-[1200ms] ease-[var(--ease-lux)] group-hover:scale-105" />
                      <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                      {fits && <span className="absolute left-2 top-2 rounded-full bg-surface/95 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-brand-deep">Best fit</span>}
                      <span className="absolute inset-x-2 bottom-2 text-white">
                        <span className="block font-serif text-[15px] leading-tight">{m.label}</span>
                        <span className="block text-[10px] opacity-80">{m.desc}</span>
                      </span>
                      {modelBusy === m.id && <span className="absolute inset-0 flex items-center justify-center bg-black/40"><Loader2 className="size-5 animate-spin text-white" /></span>}
                    </button>
                  );
                })}
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
                  <video ref={attachVideo} autoPlay playsInline muted className="absolute inset-0 size-full object-cover" />
                ) : photo && (
                  <img ref={(el) => { (imgRef as React.MutableRefObject<HTMLImageElement | null>).current = el; setImgEl(el); }} src={photo.url} alt="Your photo" draggable={false} onLoad={() => { lmsRef.current = null; detectPhoto(); }} className="absolute inset-0 size-full" />
                )}
                <div className="pointer-events-none absolute inset-0" style={phase === "photo" && split != null ? { clipPath: `inset(0 0 0 ${split}%)` } : undefined}>
                <AnimatePresence>
                  {ready && auto && !compare && asset && !show3d && auto.items.map((p, i) => {
                    const src = asset.halves?.[i] ?? asset.src;
                    const lit = phase === "live" ? light : 1;
                    return (
                      <motion.div
                        key={`${asset.src.slice(-24)}-${i}`}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: p.op ?? 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.35, ease: EASE, opacity: { duration: 0.12 } }}
                        className="pointer-events-none absolute"
                        style={{
                          left: `${(p.cx + adj.dx) * 100}%`,
                          top: `${(p.cy + adj.dy) * 100}%`,
                          width: `${p.w * adj.scale * 100}%`,
                          aspectRatio: `${asset.aspect}`,
                          x: "-50%", y: "-50%",
                          rotate: p.rot + adj.rot,
                          scaleX: (adj.flip ? -1 : 1) * (i === 1 && !asset.halves ? -1 : 1),
                          // soft contact shadow + brightness matched to the room
                          filter: `brightness(${lit.toFixed(3)}) drop-shadow(0 ${Math.max(1, p.w * 160).toFixed(1)}px ${Math.max(2, p.w * 220).toFixed(1)}px rgba(40,20,10,.35))`,
                        }}
                      >
                        <img src={src} alt="" draggable={false} className="absolute inset-0 size-full max-w-none" />
                        {/* moving glint, masked to the piece */}
                        <span className="jewel-shine absolute inset-0" style={{ WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")`, WebkitMaskSize: "100% 100%", maskSize: "100% 100%", animationDelay: `${i * 0.6}s` }} />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {show3d && <canvas ref={setArCanvas} className="pointer-events-none absolute inset-0 size-full" style={{ visibility: compare ? "hidden" : "visible" }} />}
                </div>
              </div>

              {/* Before / after split */}
              {phase === "photo" && split != null && (
                <div className="absolute inset-0 z-20">
                  <div className="pointer-events-none absolute inset-y-0 w-[2px] -translate-x-1/2 bg-surface shadow-[0_0_12px_rgba(0,0,0,.45)]" style={{ left: `${split}%` }}>
                    <span className="absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-brand bg-surface text-foreground shadow-lg">
                      <ChevronsLeftRight className="size-4" />
                    </span>
                  </div>
                  <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur">Before</span>
                  <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-brand px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">With piece</span>
                  <input type="range" min={0} max={100} step={0.5} value={split} aria-label="Before and after comparison" onChange={(e) => setSplit(Number(e.target.value))} onPointerDown={(e) => e.stopPropagation()} className="absolute inset-0 size-full cursor-ew-resize opacity-0" />
                </div>
              )}

              {/* 3D: guided scan, loading and errors */}
              {show3d && ls && <ScanOverlay state={ls} onSkip={() => liveRef.current?.skipScan()} onUse2d={() => setUse3d(false)} live={phase === "live"} />}
              <AnimatePresence>
                {show3d && note && (
                  <motion.span initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute left-1/2 top-12 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-surface/95 px-3 py-1.5 text-[11.5px] font-semibold shadow">
                    {note}
                  </motion.span>
                )}
              </AnimatePresence>

              {can3d && (
                <button onClick={() => setUse3d((v) => !v)} className="absolute right-3 top-12 z-10 rounded-full bg-black/55 px-2.5 py-1 text-[10.5px] font-semibold text-white backdrop-blur">
                  {use3d ? "3D ✓ · tap for 2D" : "Switch to 3D"}
                </button>
              )}
              <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur">Visualization only</span>
              {show3d ? (ls && ls.stage !== "scan" && <Live3dChip state={ls} />) : asset === "loading" ? (
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
                  {show3d && spec3d?.kind === "ring"
                    ? <RoundBtn label="Wear the stone on the palm side" onClick={() => setFlip((f) => !f)}><FlipHorizontal2 className="size-5" /></RoundBtn>
                    : <RoundBtn label="Upload a photo instead" onClick={() => { stopCamera(); setPhase("choose"); }}><ImageUp className="size-5" /></RoundBtn>}
                </div>
              )}
            </div>

            {/* Switch pieces without leaving the camera */}
            <div className="mt-4">{rail}</div>

            {/* Adjust — 3D: real-world fit controls */}
            {show3d && (
              <div className="mt-4 rounded-[20px] border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold">Fit &amp; finish</span>
                  <span className="text-[11px] text-muted-foreground">True-to-size · follows you in 3D</span>
                </div>
                {spec3d && (
                  <div className="mt-3 flex items-center gap-3 text-[12px] text-muted-foreground">
                    <span className="w-14">Metal</span>
                    <div className="flex gap-2" role="radiogroup" aria-label="Metal">
                      {(Object.keys(METALS) as Metal[]).map((m) => (
                        <button key={m} role="radio" aria-checked={(metal3 ?? spec3d.metal) === m} title={METALS[m].label} onClick={() => pickMetal(m)}
                          className={cn("size-7 rounded-full ring-offset-2 ring-offset-surface transition", (metal3 ?? spec3d.metal) === m ? "ring-2 ring-brand" : "hover:scale-110")}
                          style={{ background: `radial-gradient(circle at 35% 30%, #fff, ${METALS[m].color} 50%, #6b5a3a)` }} />
                      ))}
                    </div>
                  </div>
                )}
                <Slider label="Size" min={0.7} max={1.4} step={0.02} value={fitUi.size} onChange={(v) => setFit("size", v)} suffix={`${Math.round(fitUi.size * 100)}%`} />
                <Slider label="Height" min={-1.5} max={1.5} step={0.05} value={fitUi.height} onChange={(v) => setFit("height", v)} />
                <Slider label="Depth" min={-1.5} max={1.5} step={0.05} value={fitUi.depth} onChange={(v) => setFit("depth", v)} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip onClick={resetFit}><RotateCcw className="size-3.5" /> Reset</Chip>
                  <Chip onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)}>Hold to compare</Chip>
                  {spec3d?.kind === "ring" && <Chip onClick={() => setFlip((f) => !f)}><FlipHorizontal2 className="size-3.5" /> {flip ? "Stone on back of hand" : "Stone on palm side"}</Chip>}
                  {phase === "live" && <Chip onClick={() => liveRef.current?.startScan()}><ScanFace className="size-3.5" /> Rescan</Chip>}
                  {phase === "photo" && liveSupported && <Chip onClick={() => startCamera(handFirst ? "environment" : "user")}><Video className="size-3.5" /> Go live</Chip>}
                  {phase === "photo" && <Chip onClick={() => setSplit((v) => (v == null ? 50 : null))}><ChevronsLeftRight className="size-3.5" /> {split == null ? "Before / after" : "Hide slider"}</Chip>}
                  {phase === "photo" && <Chip onClick={() => setPhase("choose")}><RefreshCw className="size-3.5" /> New photo</Chip>}
                </div>
              </div>
            )}
            {ready && !show3d && (
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
                  {phase === "photo" && <Chip onClick={() => setSplit((v) => (v == null ? 50 : null))}><ChevronsLeftRight className="size-3.5" /> {split == null ? "Before / after" : "Hide slider"}</Chip>}
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

      <Modal open={!!shot} onClose={() => setShot(null)} title="Your try-on">
        {shot && (
          <div>
            <img src={shot} alt={`You wearing ${product.name}`} className="w-full rounded-2xl" />
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <LuxuryButton variant="gold" onClick={() => save(shot)} icon={<Download className="size-4" />}>Save</LuxuryButton>
              <LuxuryButton variant="outline" onClick={() => share(shot)} icon={<Share2 className="size-4" />}>Share</LuxuryButton>
            </div>
            <button
              onClick={() => { const raw = liveRef.current?.frameImage(facing === "user"); setShot(null); if (raw) { stopCamera(); usePhoto(raw); } }}
              className="mt-3 w-full text-center text-[12.5px] font-semibold text-muted-foreground underline underline-offset-4"
            >Continue on this photo{aiEnabled ? " (AI render, fine-tune)" : ""}</button>
          </div>
        )}
      </Modal>

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
                <JewelImage src={p.image} piece={p} alt="" loading="lazy" className={cn("transition-transform duration-500", on && "scale-105")} />
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

function Slider({ label, min, max, step, value, onChange, suffix }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="mt-3 flex items-center gap-3 text-[12px] text-muted-foreground">
      <span className="w-14">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-[var(--color-brand)]" />
      {suffix && <span className="w-9 text-right tabular-nums">{suffix}</span>}
    </label>
  );
}

/** Guided scan (face: centre → turn → turn back; hand: palm → back), loading and error states. */
function ScanOverlay({ state, onSkip, onUse2d, live }: { state: LiveState; onSkip: () => void; onUse2d: () => void; live: boolean }) {
  if (state.stage === "loading") {
    return (
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/35 text-white backdrop-blur-[2px]">
        <Loader2 className="size-6 animate-spin" />
        <span className="text-[12.5px] font-semibold">{state.status}</span>
        <span className="text-[11px] opacity-75">Runs on your device · nothing is uploaded</span>
      </div>
    );
  }
  if (state.stage === "error") {
    return (
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/55 p-6 text-center text-white">
        <span className="text-[13px] font-semibold">{state.error ?? "Tracking isn't available on this device."}</span>
        <button onClick={onUse2d} className="rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-black">Use the 2D try-on</button>
      </div>
    );
  }
  if (state.stage !== "scan" || !state.scan || !live) return null;
  const sc = state.scan;
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {sc.oval && (
        <div className="absolute left-1/2 top-[44%] h-[58%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[50%] border-[3px] transition-colors duration-300"
          style={{ aspectRatio: "0.74", borderColor: sc.ok ? "rgba(120,220,160,.95)" : "rgba(255,255,255,.75)", boxShadow: "0 0 0 2000px rgba(0,0,0,.28)" }}>
          <span className="tryon-scanline absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-white/90 to-transparent" />
        </div>
      )}
      <div className="absolute inset-x-3 bottom-24 rounded-2xl bg-black/60 p-3.5 text-white backdrop-blur">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.2em] opacity-75">
          <span>Step {sc.step + 1} of {sc.steps}</span><span>{state.status}</span>
        </div>
        <div className="mt-1 font-serif text-[20px] leading-tight">{sc.title}</div>
        <div className="mt-0.5 text-[12px] opacity-85">{sc.hint}</div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-[#e9c35f] transition-[width] duration-150" style={{ width: `${Math.round(sc.progress * 100)}%` }} /></div>
        <button onClick={onSkip} className="pointer-events-auto mt-2.5 rounded-full border border-white/40 px-3 py-1 text-[11px] font-semibold">Skip scan</button>
      </div>
    </div>
  );
}

function Live3dChip({ state }: { state: LiveState }) {
  return (
    <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-surface/95 px-2.5 py-1 text-[10.5px] font-semibold text-foreground">
      {state.stage === "loading" ? <Loader2 className="size-3 animate-spin text-brand-deep" /> : <span className={cn("size-1.5 rounded-full", state.tracking ? "bg-ok" : "bg-brand")} />}
      {state.status}
    </span>
  );
}

function Chip({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...rest} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold text-foreground/80 transition hover:border-foreground/40 hover:text-foreground">{children}</button>;
}

function RoundBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button aria-label={label} title={label} onClick={onClick} className="flex size-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition active:scale-95">{children}</button>;
}
