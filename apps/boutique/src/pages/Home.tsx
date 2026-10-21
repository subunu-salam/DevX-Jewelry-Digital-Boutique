import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, CalendarClock, Coins, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { specFromProduct } from "@/lib/jewel3d/spec";
import type { Product, Storefront } from "@/lib/types";
import { Jewel3DStill, Jewel3DViewer, JewelImage, LuxuryButton, OpeningScreen, ProductCard, ProductCardSkeleton, lineUp, reveal, stagger, t } from "@/design";

/** Studio landing: the signature piece live in 3D, then collections and signature pieces. */
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

  // the hero piece: the first featured piece that can be shown in 3D
  const hero = useMemo(() => featured.find((p) => specFromProduct(p)) ?? null, [featured]);
  const signature = featured.filter((p) => p !== hero).slice(0, 4);
  const collections = (storefront?.collections ?? []).slice(0, 4);
  const categories = storefront?.categories ?? [];

  return (
    <div className="pb-6">
      <OpeningScreen image={featured[0]?.image} />

      {/* ── Hero: headline + the signature piece live in the studio ── */}
      <section className="relative overflow-hidden px-4 pt-6">
        <div aria-hidden className="studio-glow -right-40 -top-24 size-[520px]" />
        <motion.div variants={stagger(0.12, 0.15)} initial="hidden" animate="show" className="relative">
          <motion.div variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: t(0.8) } }} className="eyebrow">
            Fine gold &amp; diamond jewellery · Dubai
          </motion.div>
          <h1 className="mt-4 font-serif text-[52px] font-normal leading-[1.02]">
            <span className="block overflow-hidden pb-[0.04em]"><motion.span variants={lineUp} className="block">Quietly</motion.span></span>
            <span className="block overflow-hidden pb-[0.12em]"><motion.span variants={lineUp} className="block italic"><em className="gold-text">extraordinary.</em></motion.span></span>
          </h1>
          <motion.p variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: t(0.9) } }} className="mt-3 max-w-[340px] text-[15px] leading-relaxed text-[#c9bfae]">
            Every piece in our 3D studio — turn it in the light, change the metal and stone, then try it on.
          </motion.p>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={t(1.2, 0.4)} className="relative -mx-4 mt-2 h-[400px]">
          {hero ? (
            <Jewel3DViewer product={hero} minimal className="!aspect-auto h-full rounded-none" />
          ) : (
            <div className="studio-shimmer absolute inset-0" />
          )}
        </motion.div>
        {hero && (
          <Link to={`/product/${hero.slug}`} className="relative -mt-1 block text-center">
            <span className="font-serif text-[22px]">{hero.name}</span>
            <span className="ml-2 text-[12px] text-muted-foreground">{hero.karat}K {hero.metalColor}</span>
          </Link>
        )}

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={t(0.9, 0.8)} className="relative mt-6 flex gap-3">
          <LuxuryButton variant="gold" size="lg" className="flex-1" onClick={() => navigate("/catalog")} iconRight={<ArrowRight className="size-4" />}>Shop</LuxuryButton>
          <LuxuryButton variant="outline" size="lg" className="flex-1" onClick={() => navigate(hero ? `/try-on/${hero.slug}` : "/try-on")} icon={<Sparkles className="size-4" />}>Try on</LuxuryButton>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={t(1, 1)} className="relative mt-8 flex gap-8">
          {[
            { v: loaded ? `${featured.length}+` : "—", l: "Pieces" },
            { v: "3", l: "Gold tones" },
            { v: "Live", l: "Gold price" },
          ].map((s) => (
            <div key={s.l} className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <b className="block font-serif text-[30px] font-medium normal-case leading-[1.1] tracking-normal text-brand-deep">{s.v}</b>
              {s.l}
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── Marquee ── */}
      <div className="mt-10 overflow-hidden whitespace-nowrap border-y border-border bg-sand py-4">
        <div className="marquee-track pl-12 font-serif text-[21px] italic text-[#c9bfae]">
          {Array(2).fill(["Round brilliant", "18K · 22K · 24K gold", "Cushion halo", "Pear drops", "Emerald cut", "Rivière", "Live virtual try-on"]).flat().map((w, i) => (
            <span key={i} className="inline-flex items-center gap-12">{w}<span className="not-italic text-[13px] text-brand">✦</span></span>
          ))}
        </div>
      </div>

      {/* ── Collections ── */}
      {(collections.length > 0 || categories.length > 0) && (
        <section className="px-4 pt-14">
          <SectionHead eyebrow="Collections" title="Ways to wear light" />
          <motion.div variants={stagger(0.08)} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }} className="grid grid-cols-2 gap-3">
            {(collections.length > 0
              ? collections.map((c) => ({ key: c.id, to: `/catalog?collection=${c.slug}`, name: c.name, sub: c.description, image: c.heroImage }))
              : categories.slice(0, 4).map((c) => ({ key: c.id, to: `/catalog?category=${c.slug}`, name: c.name, sub: null, image: null as string | null | undefined }))
            ).map((c) => {
              const piece = featured.find((p) => p.category?.slug && c.to.endsWith(p.category.slug)) ?? null;
              return (
                <motion.div key={c.key} variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: t(0.8) } }}>
                  <Link to={c.to} className="group relative block aspect-[4/5] overflow-hidden rounded-[14px] border border-border bg-surface transition-colors duration-500 hover:border-brand">
                    {c.image ? (
                      <JewelImage src={c.image} alt="" loading="lazy" className="transition-transform duration-[1200ms] ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.06]" />
                    ) : piece ? (
                      <Jewel3DStill piece={piece} aspect={4 / 5} imgClassName="transition-transform duration-[1200ms] group-hover:scale-[1.06]" />
                    ) : null}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-4 pt-14">
                      <span className="block text-[10px] uppercase tracking-[0.22em] text-brand">Explore</span>
                      <span className="block font-serif text-[24px] leading-tight text-[#f3ecdf]">{c.name}</span>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        </section>
      )}

      {/* ── Gold Savings ── */}
      <motion.div {...reveal} className="px-4 pt-10">
        <Link to="/gold-savings" className="panel-card group relative flex items-center gap-4 overflow-hidden rounded-[18px] px-5 py-4 transition hover:border-brand">
          <span className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-brand/15 blur-2xl" />
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border-secondary text-brand"><Coins className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="eyebrow block !text-[10px]">New · Gold savings</span>
            <span className="block font-serif text-lg leading-snug">Save monthly, earn a bonus — or lock in today's gold rate.</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-brand transition group-hover:translate-x-0.5" />
        </Link>
      </motion.div>

      {/* ── Signature pieces ── */}
      <section className="mt-14 bg-sand px-4 py-14">
        <SectionHead eyebrow="Signature pieces" title={<>Made to be <em className="gold-text">turned</em> in the light</>} />
        <motion.div variants={stagger(0.08)} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }} className="grid grid-cols-2 gap-3">
          {!loaded
            ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
            : signature.map((p) => <ProductCard key={p.id} product={p} />)}
        </motion.div>
        <LuxuryButton variant="outline" full className="mt-6" onClick={() => navigate("/catalog")} iconRight={<ArrowRight className="size-4" />}>See every piece</LuxuryButton>
      </section>

      {/* ── How try-on works ── */}
      <section className="px-4 pt-14">
        <SectionHead eyebrow="Virtual try-on" title="See it on you, in motion" />
        <div className="grid grid-cols-2 gap-3">
          {[
            { h: "Scan", p: "A short guided scan measures you so pieces sit true to size." },
            { h: "Choose", p: "Pick a piece and change its metal and stone." },
            { h: "Wear", p: "See it on you live, lit like the real thing." },
            { h: "Keep", p: "Save a photo, or reserve it for a private viewing." },
          ].map((s, i) => (
            <motion.div key={s.h} {...reveal} className="panel-card rounded-[14px] p-5">
              <span className="block font-serif text-[38px] leading-none text-brand opacity-80">0{i + 1}</span>
              <h4 className="mt-2 font-serif text-[22px]">{s.h}</h4>
              <p className="mt-1 text-[13px] leading-relaxed text-[#c9bfae]">{s.p}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Private viewing ── */}
      <motion.section {...reveal} className="panel-card relative mx-4 mt-14 flex flex-col gap-3.5 overflow-hidden rounded-[20px] px-6 py-7">
        <div aria-hidden className="studio-glow -right-20 -top-20 size-64" />
        <CalendarClock className="relative size-[22px] text-brand" strokeWidth={1.4} />
        <h2 className="relative font-serif text-[34px] font-normal leading-none">
          A private viewing,<br /><em className="gold-text">at your pace.</em>
        </h2>
        <p className="relative text-[13px] leading-relaxed text-[#c9bfae]">
          An advisor prepares your selection before you arrive. Gold Souk Deira, The Dubai Mall or The Galleria Abu Dhabi.
        </p>
        <LuxuryButton variant="gold" size="lg" full className="relative mt-1" onClick={() => navigate("/appointments")} iconRight={<ArrowRight className="size-4" />}>
          Reserve a time
        </LuxuryButton>
      </motion.section>
    </div>
  );
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: React.ReactNode }) {
  return (
    <motion.div {...reveal} className="mb-6">
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="mt-2.5 font-serif text-[36px] font-normal leading-[1.05]">{title}</h2>
    </motion.div>
  );
}
