import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, BadgeCheck, CalendarClock, Check, ChevronLeft, ChevronRight, Expand, Heart, Link2, Share2, ShieldCheck, X } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "@ui";
import { api } from "@/lib/api";
import { useStore } from "@/context/store";
import type { Product } from "@/lib/types";
import { Badge, Breadcrumb, EASE, LuxuryButton, Price, ProductGrid, SectionHeading, flyToCart, stagger, t, useToast } from "@/design";

export default function ProductDetail() {
  const { slug } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setProduct(null); setError(false);
    api.get<Product>(`/api/public/products/${slug}`)
      .then((p) => {
        setProduct(p);
        const q = p.category ? `category=${p.category.slug}` : "featured=true";
        api.get<Product[]>(`/api/public/products?${q}&limit=9`).then((r) => setRelated(r.filter((x) => x.id !== p.id).slice(0, 4))).catch(() => {});
      })
      .catch(() => setError(true));
  }, [slug]);

  if (error) return (
    <div className="mx-auto max-w-xl px-4 py-32 text-center">
      <div className="font-serif text-[40px] italic">This piece has moved on</div>
      <p className="mt-2 text-muted-foreground">It may have found its owner. Explore similar designs in the collection.</p>
      <Link to="/catalog" className="mt-6 inline-block"><LuxuryButton tabIndex={-1}>Back to the collection</LuxuryButton></Link>
    </div>
  );
  if (!product) return <DetailSkeleton />;

  return (
    <div className="pb-28 md:pb-0">
      <div className="mx-auto max-w-[1320px] px-4 md:px-8">
        <div className="flex items-center justify-between py-4 md:py-6">
          <Link to="/catalog" className="group inline-flex items-center gap-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="size-4 transition-transform duration-500 group-hover:-translate-x-1" /> Back to collection
          </Link>
          <div className="hidden md:block">
            <Breadcrumb items={[{ label: "Jewellery", to: "/catalog" }, ...(product.category ? [{ label: product.category.name, to: `/catalog?category=${product.category.slug}` }] : []), { label: product.name }]} />
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-[1.15fr_1fr] md:gap-12 lg:gap-20">
          <Gallery product={product} />
          <InfoPanel product={product} />
        </div>

        <Details product={product} />

        {related.length > 0 && (
          <section className="pt-20 md:pt-28">
            <SectionHeading title="You may also like" action={product.category ? { label: `More ${product.category.name.toLowerCase()}`, to: `/catalog?category=${product.category.slug}` } : undefined} />
            <ProductGrid products={related} columns={4} />
          </section>
        )}
      </div>
      <MobileBar product={product} />
    </div>
  );
}

/* ───────────────────────── Gallery ───────────────────────── */

function Gallery({ product }: { product: Product }) {
  const images = product.media?.filter((m) => m.kind !== "VIDEO").map((m) => m.url) ?? [];
  if (!images.length && product.image) images.push(product.image);
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const [full, setFull] = useState(false);
  const go = (n: number) => { if (!images.length) return; setDir(n > idx ? 1 : -1); setIdx((n + images.length) % images.length); };

  return (
    <div className="md:sticky md:top-24 md:self-start">
      <div className="flex gap-4">
        {images.length > 1 && (
          <div className="hidden w-[72px] shrink-0 flex-col gap-3 md:flex">
            {images.map((src, i) => (
              <button key={src + i} onClick={() => go(i)} aria-label={`View image ${i + 1}`} className={cn("relative aspect-[4/5] overflow-hidden rounded-xl transition-opacity duration-500", i === idx ? "opacity-100" : "opacity-50 hover:opacity-90")}>
                <img src={src} alt="" className="size-full object-cover" />
                {i === idx && <motion.span layoutId="thumb-ring" className="absolute inset-0 rounded-xl ring-1 ring-inset ring-foreground" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
              </button>
            ))}
          </div>
        )}

        <div className="relative flex-1">
          <ZoomStage src={images[idx]} alt={product.name} dir={dir} onNext={() => go(idx + 1)} onPrev={() => go(idx - 1)} count={images.length} onExpand={() => setFull(true)} />
          <div className="absolute left-4 top-4 flex gap-1.5">
            {product.isNew && <Badge tone="new">New</Badge>}
            {product.certNumber && <Badge tone="new"><BadgeCheck className="size-3 text-brand-deep" />{product.certIssuer ?? "Certified"}</Badge>}
          </div>
          {images.length > 1 && (
            <div className="mt-4 flex justify-center gap-1.5 md:hidden">
              {images.map((_, i) => <motion.span key={i} animate={{ width: i === idx ? 20 : 6, opacity: i === idx ? 1 : 0.35 }} className="h-1.5 rounded-full bg-foreground" />)}
            </div>
          )}
        </div>
      </div>
      <Lightbox open={full} images={images} index={idx} onIndex={go} onClose={() => setFull(false)} alt={product.name} />
    </div>
  );
}

/** Main image: hover lens zoom on desktop, swipe on touch. */
function ZoomStage({ src, alt, dir, onNext, onPrev, count, onExpand }: { src?: string; alt: string; dir: number; onNext: () => void; onPrev: () => void; count: number; onExpand: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={() => setZoom(null)}
      data-fly-source
      className={cn("group relative aspect-[4/5] overflow-hidden rounded-[24px] bg-champagne", zoom ? "cursor-zoom-in" : "")}
    >
      <AnimatePresence initial={false} custom={dir} mode="popLayout">
        {src && (
          <motion.img
            key={src}
            src={src}
            alt={alt}
            custom={dir}
            variants={{ enter: (d: number) => ({ opacity: 0, x: d * 40, scale: 1.04 }), center: { opacity: 1, x: 0, scale: 1 }, exit: (d: number) => ({ opacity: 0, x: d * -40 }) }}
            initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.8, ease: EASE }}
            drag={count > 1 ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragEnd={(_, i) => { if (i.offset.x < -60) onNext(); else if (i.offset.x > 60) onPrev(); }}
            onClick={onExpand}
            draggable={false}
            className="absolute inset-0 size-full touch-pan-y object-cover"
          />
        )}
      </AnimatePresence>

      {/* Desktop lens: a magnified copy follows the cursor */}
      <AnimatePresence>
        {zoom && src && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
            className="pointer-events-none absolute inset-0 hidden md:block"
            style={{ backgroundImage: `url(${src})`, backgroundSize: "220%", backgroundPosition: `${zoom.x}% ${zoom.y}%` }}
          />
        )}
      </AnimatePresence>

      <button onClick={onExpand} aria-label="View full screen" className="absolute bottom-4 right-4 flex size-10 items-center justify-center rounded-full bg-surface/90 text-foreground/80 backdrop-blur transition-all duration-500 hover:text-foreground md:opacity-0 md:group-hover:opacity-100">
        <Expand className="size-4" />
      </button>
      {count > 1 && (
        <div className="absolute inset-y-0 left-0 right-0 hidden items-center justify-between px-3 md:flex">
          {[{ fn: onPrev, Icon: ChevronLeft, l: "Previous" }, { fn: onNext, Icon: ChevronRight, l: "Next" }].map(({ fn, Icon, l }) => (
            <button key={l} onClick={fn} aria-label={l} className="flex size-10 items-center justify-center rounded-full bg-surface/85 opacity-0 backdrop-blur transition-opacity duration-500 group-hover:opacity-100"><Icon className="size-4" /></button>
          ))}
        </div>
      )}
    </div>
  );
}

function Lightbox({ open, images, index, onIndex, onClose, alt }: { open: boolean; images: string[]; index: number; onIndex: (n: number) => void; onClose: () => void; alt: string }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") onIndex(index + 1); if (e.key === "ArrowLeft") onIndex(index - 1); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", k);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", k); };
  }, [open, index, onClose, onIndex]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="fixed inset-0 z-[120] flex items-center justify-center bg-background" role="dialog" aria-label="Image viewer">
          <button onClick={onClose} aria-label="Close" className="absolute right-4 top-[calc(16px+env(safe-area-inset-top))] z-10 flex size-11 items-center justify-center rounded-full bg-surface shadow-[var(--shadow-lift)]"><X className="size-5" /></button>
          <AnimatePresence mode="wait">
            <motion.img
              key={images[index]} src={images[index]} alt={alt}
              initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.6, ease: EASE }}
              drag="x" dragConstraints={{ left: 0, right: 0 }} onDragEnd={(_, i) => { if (i.offset.x < -60) onIndex(index + 1); else if (i.offset.x > 60) onIndex(index - 1); }}
              className="max-h-[88dvh] max-w-[94vw] rounded-2xl object-contain"
            />
          </AnimatePresence>
          {images.length > 1 && <div className="absolute bottom-[calc(24px+env(safe-area-inset-bottom))] text-[13px] tabular-nums text-muted-foreground">{index + 1} / {images.length}</div>}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ───────────────────────── Info panel ───────────────────────── */

function InfoPanel({ product }: { product: Product }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { addToCart, saved, toggleSaved } = useStore();
  const isSaved = saved.includes(product.id);
  const [added, setAdded] = useState(false);
  const inStock = product.availability.filter((a) => a.quantity > 0);

  const facts = [
    `${product.karat}K ${product.metalColor} ${product.metal}`,
    `${product.grossWeight} g`,
    product.stoneType ? `${product.stoneType}${product.totalCarat ? `, ${product.totalCarat} ct` : ""}` : null,
  ].filter(Boolean) as string[];

  const addInquiry = () => {
    flyToCart(document.querySelector("[data-fly-source]"), product.image);
    addToCart(product);
    setAdded(true);
    toast({ title: "Added to your inquiry", body: product.name, image: product.image, action: { label: "View bag", to: "/cart" } });
    setTimeout(() => setAdded(false), 2200);
  };
  const save = () => {
    toggleSaved(product.id);
    toast({ title: isSaved ? "Removed from your collection" : "Saved to your collection", body: product.name, image: product.image });
  };

  return (
    <motion.div variants={stagger(0.08, 0.1)} initial="hidden" animate="show" className="md:pt-6">
      <motion.div variants={item} className="flex items-center gap-2 text-[13px] text-muted-foreground">
        {product.collection && <Link to={`/catalog?collection=${product.collection.slug}`} className="font-serif text-[16px] italic text-brand-deep hover:underline">{product.collection.name}</Link>}
        <span className="ml-auto tabular-nums">SKU {product.sku}</span>
      </motion.div>
      <motion.h1 variants={item} className="mt-3 font-serif text-[40px] leading-[1] md:text-[58px]">{product.name}</motion.h1>
      <motion.div variants={item} className="mt-5">
        <Price priceMode={product.priceMode} basePrice={product.basePrice} discount={product.discount} size="lg" />
        {product.priceMode === "FIXED" && <p className="mt-2 text-[12px] text-muted-foreground">Indicative price at today's gold rate. Final quote confirmed by your advisor.</p>}
      </motion.div>

      <motion.ul variants={item} className="mt-7 flex flex-wrap gap-2">
        {facts.map((f) => <li key={f} className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px]">{f}</li>)}
      </motion.ul>

      <motion.div variants={item} className="mt-7 rounded-[18px] border border-border bg-surface p-5">
        <div className="text-[13px] font-semibold">Available at</div>
        <ul className="mt-3 space-y-2.5">
          {product.availability.map((a) => (
            <li key={a.branchId} className="flex items-center justify-between text-[14px]">
              <span className={a.quantity > 0 ? "" : "text-muted-foreground"}>{a.branchName}</span>
              {a.quantity > 0
                ? <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ok"><Check className="size-3.5" strokeWidth={2.5} /> In boutique</span>
                : <span className="text-[12.5px] text-muted-foreground">By order</span>}
            </li>
          ))}
        </ul>
        {inStock.length === 0 && <p className="mt-3 text-[12.5px] text-muted-foreground">Send an inquiry and an advisor will source this piece for you.</p>}
      </motion.div>

      <motion.div variants={item} className="mt-7 hidden gap-3 md:flex">
        <LuxuryButton size="lg" className="flex-1" onClick={addInquiry} icon={<AnimatePresence mode="wait">{added && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Check className="size-4" /></motion.span>}</AnimatePresence>}>
          {added ? "Added to inquiry" : "Add to inquiry"}
        </LuxuryButton>
        <LuxuryButton size="lg" variant="outline" onClick={save} aria-pressed={isSaved} icon={<Heart className={cn("size-4 transition-all duration-500", isSaved && "fill-brand text-brand")} />}>
          {isSaved ? "In your collection" : "Add to collection"}
        </LuxuryButton>
      </motion.div>

      <motion.div variants={item} className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button onClick={() => navigate("/appointments")} className="group inline-flex items-center gap-2 text-[14px] font-semibold">
          <CalendarClock className="size-4 text-brand" />
          <span className="underline decoration-brand-soft underline-offset-[6px] transition-colors group-hover:decoration-brand-deep">Book an appointment to see it</span>
        </button>
        <ShareButton product={product} />
      </motion.div>

      {product.description && <motion.p variants={item} className="mt-8 max-w-[60ch] font-serif text-[19px] leading-[1.55] text-foreground/85">{product.description}</motion.p>}
    </motion.div>
  );
}
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: t(0.8) } };

function ShareButton({ product }: { product: Product }) {
  const toast = useToast();
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) { navigator.share({ title: product.name, text: `${product.name} at Aurelia`, url }).catch(() => {}); return; }
    try { await navigator.clipboard.writeText(url); toast({ title: "Link copied", body: "Share it on WhatsApp or anywhere you like." }); } catch { /* ignore */ }
  };
  return (
    <button onClick={share} className="inline-flex items-center gap-2 text-[14px] font-semibold text-muted-foreground transition-colors hover:text-foreground">
      {typeof navigator !== "undefined" && "share" in navigator ? <Share2 className="size-4" /> : <Link2 className="size-4" />} Share
    </button>
  );
}

/* ───────────────────────── Details / care ───────────────────────── */

function Details({ product }: { product: Product }) {
  const rows: [string, string | number | null | undefined][] = [
    ["Metal", `${product.karat}K ${product.metalColor} ${product.metal}`],
    ["Gross weight", `${product.grossWeight} g`],
    ["Net weight", `${product.netWeight} g`],
    ["Stone", product.stoneType ? `${product.stoneType}${product.stoneCount ? `, ${product.stoneCount} stones` : ""}${product.totalCarat ? `, ${product.totalCarat} ct total` : ""}` : "None"],
    ["Dimensions", product.dimensions],
    ["Certificate", product.certNumber ? `${product.certIssuer ?? ""} ${product.certNumber}`.trim() : null],
    ["Occasion", product.occasion],
    ["SKU", product.sku],
  ];
  return (
    <section className="mt-16 border-t border-border md:mt-24 md:grid md:grid-cols-[1.15fr_1fr] md:gap-12 lg:gap-20">
      <Accordion title="Product details" defaultOpen>
        <dl className="grid gap-x-10 sm:grid-cols-2">
          {rows.filter(([, v]) => v != null && v !== "").map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-border py-3 text-[14px] last:border-0 sm:[&:nth-last-child(2)]:border-0">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </Accordion>
      <div className="md:border-l md:border-border md:pl-12 lg:pl-20">
        <Accordion title="Care & warranty" defaultOpen>
          <div className="space-y-4 text-[14px] leading-relaxed text-foreground/80">
            <p className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />{product.warranty ?? "Lifetime service warranty on craftsmanship."}</p>
            {product.certNumber && <p className="flex gap-3"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-brand" />Supplied with {product.certIssuer ?? "an independent"} certificate no. {product.certNumber}.</p>}
            <p>Store separately in the Aurelia pouch, away from perfume and chlorine. Wipe with a soft dry cloth after wear. Complimentary cleaning and inspection at any of our boutiques.</p>
          </div>
        </Accordion>
      </div>
    </section>
  );
}

function Accordion({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-b border-border md:border-0">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between py-6 text-left">
        <h2 className="font-serif text-[28px] md:text-[34px]">{title}</h2>
        <motion.span animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.5, ease: EASE }} className="text-[26px] font-light leading-none text-muted-foreground md:hidden">+</motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.55, ease: EASE }} className="overflow-hidden">
            <div className="pb-8">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* Sticky action bar for phones — sits above the tab bar. */
function MobileBar({ product }: { product: Product }) {
  const toast = useToast();
  const { addToCart, saved, toggleSaved } = useStore();
  const isSaved = saved.includes(product.id);
  return (
    <motion.div initial={{ y: 100 }} animate={{ y: 0 }} transition={t(0.7, 0.6)} className="fixed inset-x-0 bottom-[calc(80px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-[var(--app-w)] gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-xl md:hidden">
      <button
        onClick={() => { toggleSaved(product.id); toast({ title: isSaved ? "Removed from collection" : "Saved to your collection", body: product.name, image: product.image }); }}
        aria-label={isSaved ? "Remove from collection" : "Add to collection"}
        className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface"
      >
        <Heart className={cn("size-5", isSaved ? "fill-brand text-brand" : "")} strokeWidth={1.6} />
      </button>
      <LuxuryButton size="lg" className="h-12 flex-1" onClick={() => { flyToCart(document.querySelector("[data-fly-source]"), product.image); addToCart(product); toast({ title: "Added to your inquiry", body: product.name, image: product.image, action: { label: "View bag", to: "/cart" } }); }}>
        Add to inquiry
      </LuxuryButton>
    </motion.div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-[1320px] px-4 pt-16 md:px-8">
      <div className="grid gap-10 md:grid-cols-[1.15fr_1fr] md:gap-20">
        <div className="skeleton aspect-[4/5] rounded-[24px]" />
        <div className="space-y-4 pt-6">
          <div className="skeleton h-4 w-1/4 rounded" />
          <div className="skeleton h-14 w-4/5 rounded" />
          <div className="skeleton h-8 w-1/3 rounded" />
          <div className="skeleton mt-8 h-40 w-full rounded-[18px]" />
        </div>
      </div>
    </div>
  );
}
