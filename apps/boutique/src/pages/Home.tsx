import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, BadgeCheck, CalendarClock, Coins, KeyRound, ShieldCheck } from "lucide-react";
import { api, API_URL } from "@/lib/api";
import { specFromProduct } from "@/lib/jewel3d/spec";
import { backdropCss, backdropFor } from "@/lib/jewel3d/backdrop";
import type { Product, Storefront } from "@/lib/types";
import { EASE, JewelImage, LuxuryButton, OpeningScreen, Price, fallbackImage, lineUp, reveal, stagger, t } from "@/design";

/** Peach & Gold landing — first impression for private clients. */
export default function Home() {
  const navigate = useNavigate();
  const [storefront, setStorefront] = useState<Storefront | null>(null);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.allSettled([
      api.get<Storefront>("/api/public/storefront").then(setStorefront),
      api.get<Product[]>("/api/public/products?featured=true&limit=8").then(setFeatured),
    ]).finally(() => setLoaded(true));
  }, []);

  const pieces = featured.filter((p) => p.image);
  const signature = pieces[0];
  const collections = (storefront?.collections ?? []).slice(0, 4);

  return (
    <div className="pb-4">
      <OpeningScreen image={signature?.image} />

      {/* ── Hero: Quiet Type ── */}
      <section className="flex flex-col gap-5 px-4 pt-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={t(1, 0.1)} className="flex items-center gap-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.34em] text-brand-deep">Est. in Dubai</span>
          <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 1.4, ease: EASE, delay: 0.3 }} className="h-px flex-1 origin-left bg-border-secondary" />
          <span className="font-serif text-[14px] italic text-muted-foreground">Dubai · Abu Dhabi</span>
        </motion.div>

        <motion.div variants={stagger(0.12, 0.2)} initial="hidden" animate="show" className="flex flex-col gap-3">
          <h1 className="font-serif text-[60px] font-medium leading-[0.9] tracking-[-0.02em]">
            <span className="block overflow-hidden pb-[0.04em]"><motion.span variants={lineUp} className="block">Quietly</motion.span></span>
            <span className="block overflow-hidden pb-[0.1em]"><motion.span variants={lineUp} className="block italic text-brand-deep">extraordinary.</motion.span></span>
          </h1>
          <motion.p variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: t(0.9) } }} className="max-w-[300px] text-[14px] leading-relaxed text-muted-foreground">
            Jewellery that needs no introduction, for clients who need no persuasion.
          </motion.p>
        </motion.div>

        <Triptych pieces={heroPieces(featured)} loading={!loaded} />

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={t(0.9, 0.9)}>
          <EliteCTA label="Enter the collection" onClick={() => navigate("/catalog")} />
        </motion.div>

        {/* Gold Savings Plans — highlighted entry point */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={t(1.05, 0.9)}>
          <Link to="/gold-savings" className="group relative mt-4 flex items-center gap-4 overflow-hidden rounded-[22px] border border-brand/40 bg-surface px-5 py-4 transition hover:border-brand">
            <span className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-brand/15 blur-2xl" />
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand-deep"><Coins className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-deep">New · Gold Savings</span>
              <span className="block font-serif text-lg leading-snug">Save monthly, earn a bonus — or lock in today's gold rate.</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-brand-deep transition group-hover:translate-x-0.5" />
          </Link>
        </motion.div>
      </section>

      {/* ── The collections: numbered index with round thumbnails ── */}
      {collections.length > 0 && (
        <section className="mt-10 px-4">
          <motion.div {...reveal} className="pb-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-brand-deep">The collections</motion.div>
          <motion.ul variants={stagger(0.1)} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }}>
            {collections.map((c, idx) => (
              <motion.li key={c.id} variants={{ hidden: { opacity: 0, x: -14 }, show: { opacity: 1, x: 0, transition: t(0.8) } }} className="border-t border-border-secondary last:border-b">
                <Link to={`/catalog?collection=${c.slug}`} className="group flex items-center gap-3.5 py-3.5">
                  <span className="w-5 font-serif text-[15px] italic text-brand-deep">{String(idx + 1).padStart(2, "0")}</span>
                  <span className="shrink-0 rounded-full border border-brand/45 p-[3px] transition-colors duration-500 group-hover:border-brand">
                    <span className="block size-[52px] overflow-hidden rounded-full bg-champagne">
                      <JewelImage src={c.heroImage} alt="" loading="lazy" className="transition-[opacity,transform] duration-[1400ms] ease-[var(--ease-lux)] group-hover:scale-110" />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-[22px] leading-tight">{c.name}</span>
                    {c.description && <span className="block truncate text-[11.5px] text-muted-foreground">{c.description}</span>}
                  </span>
                  <ArrowRight className="size-4 shrink-0 transition-transform duration-500 group-hover:translate-x-1" />
                </Link>
              </motion.li>
            ))}
          </motion.ul>
        </section>
      )}

      {/* ── Reassurance ── */}
      <motion.section {...reveal} className="mx-4 mt-9 grid grid-cols-3 gap-1.5 border-y border-border-secondary px-1.5 py-4">
        {[
          { icon: BadgeCheck, label: "Certified stones" },
          { icon: ShieldCheck, label: "Lifetime care" },
          { icon: KeyRound, label: "By appointment" },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex flex-col items-center gap-1.5 text-center">
            <Icon className="size-5 text-brand" strokeWidth={1.4} />
            <span className="text-[11px] font-semibold">{label}</span>
          </div>
        ))}
      </motion.section>

      {/* ── Signature piece ── */}
      {signature && (
        <section className="mt-10 flex flex-col gap-4">
          <Rule>The signature piece</Rule>
          <motion.div {...reveal} className="flex items-center gap-4 px-4">
            <Link to={`/product/${signature.slug}`} className="group w-[45%] shrink-0 rounded-2xl border border-brand/45 bg-surface p-1.5">
              <div className="aspect-[4/5] overflow-hidden rounded-[10px] bg-champagne">
                <JewelImage src={signature.image} piece={signature} alt={signature.name} loading="lazy" className="transition-[opacity,transform] duration-[1600ms] ease-[var(--ease-lux)] group-hover:scale-[1.06]" />
              </div>
            </Link>
            <div className="flex min-w-0 flex-col gap-2">
              <div className="font-serif text-[25px] leading-[1.05]">{signature.name}</div>
              <div className="text-[12px] text-muted-foreground">{signature.karat}K {signature.metalColor} {signature.metal.toLowerCase()}</div>
              <Price priceMode={signature.priceMode} basePrice={signature.basePrice} discount={signature.discount} className="font-serif text-[19px]" />
              <Link to={`/product/${signature.slug}`} className="group inline-flex items-center gap-1.5 text-[12.5px] font-semibold underline decoration-brand underline-offset-[6px]">
                View piece <ArrowRight className="size-3.5 transition-transform duration-500 group-hover:translate-x-1" />
              </Link>
            </div>
          </motion.div>
        </section>
      )}

      {/* ── Private viewing ── */}
      <motion.section {...reveal} className="mx-4 mt-10 flex flex-col gap-3.5 rounded-[26px] bg-night px-6 py-7 text-on-night">
        <CalendarClock className="size-[22px] text-brand-soft" strokeWidth={1.4} />
        <h2 className="font-serif text-[34px] leading-none">
          A private viewing,<br /><span className="italic text-brand-soft">at your pace.</span>
        </h2>
        <p className="text-[13px] leading-relaxed text-on-night/70">
          An advisor prepares your selection before you arrive. Gold Souk Deira, The Dubai Mall or The Galleria Abu Dhabi.
        </p>
        <LuxuryButton variant="gold" size="lg" full className="mt-1" onClick={() => navigate("/appointments")} iconRight={<ArrowRight className="size-4" />}>
          Reserve a time
        </LuxuryButton>
      </motion.section>
    </div>
  );
}

/** Centered label between two rose-gold hairlines. */
function Rule({ children }: { children: React.ReactNode }) {
  return (
    <motion.div {...reveal} className="flex items-center gap-2.5 px-4">
      <span className="h-px flex-1 bg-border-secondary" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-brand-deep">{children}</span>
      <span className="h-px flex-1 bg-border-secondary" />
    </motion.div>
  );
}

/**
 * Pick the three hero pieces: featured pieces that can be shown in 3D, preferring three
 * different staged scenes (e.g. gold on espresso, white gold on slate, an emerald on
 * forest velvet) so the arches read as a varied, curated set.
 */
function heroPieces(featured: Product[]): Product[] {
  const able = featured.filter((p) => specFromProduct(p));
  const picked: Product[] = [];
  const seen = new Set<string>();
  for (const p of able) {
    const s = specFromProduct(p)!;
    const scene = backdropFor(s.metal, s.gem).name;
    if (!seen.has(scene)) { seen.add(scene); picked.push(p); }
    if (picked.length === 3) break;
  }
  for (const p of able) { if (picked.length === 3) break; if (!picked.includes(p)) picked.push(p); }
  for (const p of featured) { if (picked.length === 3) break; if (!picked.includes(p)) picked.push(p); }
  // the most striking piece goes in the tall centre arch
  return picked.length === 3 ? [picked[1], picked[0], picked[2]] : picked;
}

/** A still of the piece on its staged 3D backdrop; null until rendered, or if 3D isn't available. */
function useStill(product: Product | undefined, aspect: number) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setUrl(null); setFailed(false);
    const spec = product && specFromProduct(product);
    if (!product || !spec) { setFailed(true); return; }
    let alive = true;
    import("@/lib/jewel3d/still")
      .then(async ({ renderStill }) => {
        const jewel = product.model3d
          ? await import("@/lib/jewel3d/custom").then(({ loadProductModel }) => loadProductModel(product.model3d!, API_URL, spec)).catch(() => undefined)
          : undefined;
        return renderStill(spec, { jewel: jewel ?? undefined, aspect });
      })
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [product, aspect]);
  return { url, failed };
}

/**
 * Three arches side by side (the middle one taller), each a featured piece photographed in
 * 3D on a backdrop chosen for it. They rise in one after another.
 */
function Triptych({ pieces, loading }: { pieces: Product[]; loading: boolean }) {
  return (
    <div className="grid grid-cols-3 items-end gap-2">
      {[0, 1, 2].map((k) => <Arch key={k} k={k} product={pieces[k]} loading={loading} />)}
    </div>
  );
}

function Arch({ k, product, loading }: { k: number; product?: Product; loading: boolean }) {
  const reduced = useReducedMotion();
  const aspect = k === 1 ? 8 / 15 : 2 / 3;
  const { url, failed } = useStill(product, aspect);
  const spec = product ? specFromProduct(product) : null;
  const bg = spec ? backdropCss(backdropFor(spec.metal, spec.gem)) : undefined;
  // 3D still when available; the catalogue photo only if this device can't render 3D
  const src = url ?? (failed ? product?.image : null);
  const body = (
    <motion.div
      initial={{ clipPath: "inset(100% 0% 0% 0%)" }}
      animate={{ clipPath: "inset(0% 0% 0% 0%)" }}
      transition={{ duration: 1.3, ease: EASE, delay: 0.45 + k * 0.15 }}
      className={`relative overflow-hidden bg-night ${k === 1 ? "aspect-[8/15]" : "aspect-[2/3]"}`}
      style={{ borderRadius: "999px 999px 10px 10px", background: bg }}
    >
      {loading || !src ? (
        <div className={`absolute inset-0 ${bg ? "animate-pulse opacity-60" : "skeleton"}`} />
      ) : (
        <motion.img
          key={src}
          src={src}
          alt={product?.name ?? ""}
          onError={(e) => { const img = e.currentTarget; const fb = fallbackImage(product); if (img.src !== fb) img.src = fb; }}
          initial={{ opacity: 0, scale: 1.12 }}
          animate={reduced ? { opacity: 1, scale: 1 } : k === 1 ? { opacity: 1, scale: [1.02, 1.07, 1.02] } : { opacity: 1, scale: 1 }}
          transition={k === 1 && !reduced ? { opacity: { duration: 1.2 }, scale: { duration: 14, ease: "easeInOut", repeat: Infinity } } : { duration: 1.6, ease: EASE }}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {/* soft inner vignette ties the arch edge into the page */}
      <div aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_0_40px_rgba(0,0,0,.35)]" style={{ borderRadius: "inherit" }} />
    </motion.div>
  );
  return product ? (
    <Link to={`/product/${product.slug}`} aria-label={product.name} className="group block">{body}</Link>
  ) : (
    <div>{body}</div>
  );
}

/**
 * Elite call-to-action: espresso pill with an inset gold hairline, tracked capitals,
 * a gold medallion for the arrow, and a slow light sweep (on arrival and on hover).
 */
function EliteCTA({ label, onClick }: { label: string; onClick: () => void }) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      onClick={onClick}
      initial="rest"
      animate="rest"
      whileHover="hover"
      whileTap="press"
      variants={{ rest: { scale: 1 }, hover: { scale: 1 }, press: { scale: 0.985 } }}
      className="group relative flex h-[60px] w-full items-center justify-between overflow-hidden rounded-full bg-night pl-7 pr-2 text-on-night shadow-[0_22px_40px_-22px_rgba(46,33,27,.8)]"
    >
      {/* inset gold hairline, drawn in on arrival */}
      <motion.span
        aria-hidden
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, ease: EASE, delay: 1.1 }}
        className="pointer-events-none absolute inset-[4px] rounded-full border border-brand/45"
      />
      {/* light sweep: once on arrival, again on hover */}
      {!reduced && (
        <motion.span
          aria-hidden
          initial={{ x: "-130%" }}
          variants={{
            rest: { x: "330%", transition: { duration: 1.6, ease: [0.65, 0, 0.35, 1], delay: 1.6 } },
            hover: { x: ["-130%", "330%"], transition: { duration: 1.1, ease: [0.65, 0, 0.35, 1] } },
          }}
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-[rgba(232,195,172,.22)] to-transparent"
        />
      )}
      <span className="relative flex items-center gap-3">
        <span aria-hidden className="h-px w-5 bg-brand transition-all duration-700 ease-[var(--ease-lux)] group-hover:w-8" />
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.3em]">{label}</span>
      </span>
      <motion.span
        aria-hidden
        variants={{ rest: { x: 0 }, hover: { x: 3 }, press: { x: 5 } }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="relative flex size-[44px] items-center justify-center rounded-full bg-brand text-[#FFF8F2] shadow-[0_6px_16px_-6px_rgba(169,131,76,.8)]"
      >
        <ArrowRight className="size-4" />
      </motion.span>
    </motion.button>
  );
}
