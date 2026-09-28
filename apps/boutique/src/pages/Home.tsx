import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Camera, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { GoldRate, Offer, Product, Storefront } from "@/lib/types";
import { aed } from "@/lib/format";
import {
  AppointmentCard, EASE, GoldRateCard, OfferCard, OrbitCarousel, ProductGrid, SearchBar, SectionHeading, lineUp, reveal, stagger, t,
  type OrbitItem,
} from "@/design";

export default function Home() {
  const navigate = useNavigate();
  const [storefront, setStorefront] = useState<Storefront | null>(null);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [newArrivals, setNewArrivals] = useState<Product[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [gold, setGold] = useState<GoldRate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.get<Storefront>("/api/public/storefront").then(setStorefront),
      api.get<Product[]>("/api/public/products?featured=true&limit=8").then(setFeatured),
      api.get<Product[]>("/api/public/products?isNew=true&limit=8").then(setNewArrivals),
      api.get<Offer[]>("/api/public/offers").then(setOffers),
      api.get<{ rates: GoldRate[] }>("/api/public/gold/current").then((r) => setGold(r.rates.find((x) => x.karat === 22) ?? r.rates[0] ?? null)),
    ]).finally(() => setLoading(false));
  }, []);

  const heroProduct = featured.find((p) => p.image);
  const heroImage = heroProduct?.image ?? null;
  const collections = storefront?.collections.filter((c) => c.heroImage) ?? [];

  return (
    <div>
      <Hero pieces={loading ? [] : featured.length ? featured : newArrivals} gold={gold} />

      {/* Category rail — big serif words, scrolls sideways on phones */}
      {storefront && storefront.categories.length > 0 && (
        <motion.section {...reveal} className="mx-auto max-w-[1320px] px-4 pt-16 md:px-8 md:pt-24">
          <div className="no-scrollbar -mx-4 flex gap-8 overflow-x-auto border-y border-border px-4 py-5 md:mx-0 md:justify-between md:px-0">
            {storefront.categories.map((c) => (
              <Link key={c.id} to={`/catalog?category=${c.slug}`} className="group relative shrink-0 font-serif text-[26px] italic text-foreground/70 transition-colors duration-500 hover:text-foreground md:text-[32px]">
                {c.name}
                <span className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-brand transition-transform duration-700 ease-[var(--ease-lux)] group-hover:scale-x-100" />
              </Link>
            ))}
          </div>
        </motion.section>
      )}

      {/* New arrivals */}
      <section className="mx-auto max-w-[1320px] px-4 pt-16 md:px-8 md:pt-24">
        <SectionHeading title="New arrivals" subtitle="Pieces that arrived in our boutiques this season." action={{ label: "View all", to: "/catalog?filter=new" }} />
        <ProductGrid products={newArrivals.slice(0, 4)} loading={loading} columns={4} />
      </section>


      {/* Gold + Studio */}
      <section className="mx-auto grid max-w-[1320px] gap-4 px-4 pt-20 md:grid-cols-[1.2fr_1fr_1fr] md:gap-5 md:px-8 md:pt-28">
        <motion.div {...reveal}><GoldRateCard rate={gold} variant="dark" className="h-full" /></motion.div>
        <motion.div {...reveal} transition={t(0.8, 0.08)}>
          <StudioTile to="/ai/visual-search" icon={<Camera className="size-5" strokeWidth={1.5} />} title="Visual search" body="Photograph a piece you love; we'll find its closest match in our boutiques." />
        </motion.div>
        <motion.div {...reveal} transition={t(0.8, 0.16)}>
          <StudioTile to="/ai" icon={<Sparkles className="size-5" strokeWidth={1.5} />} title="AI Studio" body="Style discovery and recommendations, shaped by what you save." />
        </motion.div>
      </section>

      {/* Signature pieces */}
      {(loading || featured.length > 0) && (
        <section className="mx-auto max-w-[1320px] px-4 pt-20 md:px-8 md:pt-28">
          <SectionHeading title="Signature pieces" subtitle="The designs our advisors are asked about most." action={{ label: "Shop all", to: "/catalog" }} />
          <ProductGrid products={featured.slice(0, 8)} loading={loading} columns={4} />
        </section>
      )}


      {/* Appointment */}
      <motion.section {...reveal} className="mx-auto max-w-[1320px] px-4 pt-20 md:px-8 md:pt-28">
        <AppointmentCard image={featured[1]?.image ?? heroImage} />
      </motion.section>
    </div>
  );
}

/* ───────────────────────── Hero ───────────────────────── */

const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: t(0.9) } };

function Hero({ pieces, gold }: { pieces: Product[]; gold: GoldRate | null }) {
  const navigate = useNavigate();
  const items: OrbitItem[] = pieces
    .filter((p) => p.image)
    .slice(0, 8)
    .map((p) => ({
      id: p.slug,
      title: p.name,
      subtitle: `${p.karat}K ${p.metalColor}`,
      meta: p.priceMode === "INQUIRY" ? "Price on request" : aed(p.discount ? p.basePrice * (1 - p.discount / 100) : p.basePrice),
      image: p.image as string,
    }));

  return (
    <section className="relative overflow-hidden pt-5">
      <motion.div variants={stagger(0.12, 0.1)} initial="hidden" animate="show" className="px-4">
        <h1 className="font-serif text-[46px] leading-[0.95] tracking-[-0.02em]">
          {["Find your", "signature."].map((line) => (
            <span key={line} className="block overflow-hidden pb-[0.08em]">
              <motion.span variants={lineUp} className="block">{line}</motion.span>
            </span>
          ))}
        </h1>
        <motion.p variants={fadeUp} className="mt-3 font-serif text-[19px] italic text-muted-foreground">
          Crafted in gold. Made for your moments.
        </motion.p>
      </motion.div>

      {/* The stage: the carousel gets the full width of the app */}
      <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.4, ease: EASE, delay: 0.25 }} className="relative mt-4">
        <OrbitCarousel items={items} size="stage" onOpen={(slug) => navigate(`/product/${slug}`)} />
      </motion.div>

      <motion.div variants={fadeUp} initial="hidden" animate="show" className="mt-4 flex justify-center px-4">
        {gold?.pricePerGram && (
          <Link to="/gold-rate" className="shrink-0 rounded-full bg-night px-4 py-2 text-on-night transition-transform duration-500 active:scale-95">
            <span className="block text-[9.5px] leading-none text-brand-soft">22K today</span>
            <span className="block font-serif text-[16px] leading-tight tabular-nums">AED {gold.pricePerGram.toFixed(2)}</span>
          </Link>
        )}
      </motion.div>
    </section>
  );
}

function StudioTile({ to, icon, title, body }: { to: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <Link to={to} className="group flex h-full flex-col justify-between gap-10 rounded-[22px] border border-border bg-surface p-6 transition-all duration-700 hover:border-border-secondary hover:shadow-[var(--shadow-lift)]">
      <span className="flex size-11 items-center justify-center rounded-full bg-champagne text-brand-deep transition-transform duration-700 group-hover:rotate-[8deg]">{icon}</span>
      <div>
        <div className="font-serif text-[28px] leading-none">{title}</div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </Link>
  );
}
