import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, BadgeCheck, CalendarClock, KeyRound, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { Product, Storefront } from "@/lib/types";
import { EASE, LuxuryButton, OpeningScreen, Price, lineUp, reveal, stagger, t } from "@/design";

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

        <Triptych pieces={pieces.slice(0, 3)} loading={!loaded} />

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={t(0.9, 0.9)}>
          <LuxuryButton size="lg" full onClick={() => navigate("/catalog")} iconRight={<ArrowRight className="size-4" />}>
            Enter the collection
          </LuxuryButton>
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
                      {c.heroImage && <img src={c.heroImage} alt="" loading="lazy" className="size-full object-cover transition-transform duration-[1400ms] ease-[var(--ease-lux)] group-hover:scale-110" />}
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
                <img src={signature.image as string} alt={signature.name} loading="lazy" className="size-full object-cover transition-transform duration-[1600ms] ease-[var(--ease-lux)] group-hover:scale-[1.06]" />
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
 * Three arches side by side (the middle one taller), each a featured piece.
 * They rise in one after another; the centre arch slowly breathes.
 */
function Triptych({ pieces, loading }: { pieces: Product[]; loading: boolean }) {
  const reduced = useReducedMotion();
  const slots = [0, 1, 2].map((k) => pieces[k]);
  return (
    <div className="grid grid-cols-3 items-end gap-2">
      {slots.map((p, k) => {
        const body = (
          <motion.div
            initial={{ clipPath: "inset(100% 0% 0% 0%)" }}
            animate={{ clipPath: "inset(0% 0% 0% 0%)" }}
            transition={{ duration: 1.3, ease: EASE, delay: 0.45 + k * 0.15 }}
            className={`relative overflow-hidden bg-champagne ${k === 1 ? "aspect-[8/15]" : "aspect-[2/3]"}`}
            style={{ borderRadius: "999px 999px 10px 10px" }}
          >
            {loading || !p?.image ? (
              <div className="skeleton absolute inset-0" />
            ) : (
              <motion.img
                src={p.image}
                alt={p.name}
                loading={k === 1 ? "eager" : "lazy"}
                initial={{ scale: 1.15 }}
                animate={reduced ? { scale: 1 } : k === 1 ? { scale: [1.04, 1.1, 1.04] } : { scale: 1 }}
                transition={k === 1 && !reduced ? { duration: 14, ease: "easeInOut", repeat: Infinity } : { duration: 2, ease: EASE }}
                className="absolute inset-0 size-full object-cover transition-[filter] duration-700 group-hover:brightness-95"
              />
            )}
          </motion.div>
        );
        return p ? (
          <Link key={k} to={`/product/${p.slug}`} aria-label={p.name} className="group block">{body}</Link>
        ) : (
          <div key={k}>{body}</div>
        );
      })}
    </div>
  );
}
