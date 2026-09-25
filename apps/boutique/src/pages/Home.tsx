import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { TrendingUp, Sparkles, Search, CalendarClock, ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { aed } from "@/lib/format";
import type { Collection, GoldRate, Offer, Product, Storefront } from "@/lib/types";
import ProductCard from "@/components/ProductCard";
import { CircularGallery, type GalleryItem } from "@/components/ui/circular-gallery";

const reveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-40px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
};

export default function Home() {
  const navigate = useNavigate();
  const [storefront, setStorefront] = useState<Storefront | null>(null);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [newArrivals, setNewArrivals] = useState<Product[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [gold, setGold] = useState<GoldRate | null>(null);

  useEffect(() => {
    api.get<Storefront>("/api/public/storefront").then(setStorefront).catch(() => {});
    api.get<Product[]>("/api/public/products?featured=true&limit=8").then(setFeatured).catch(() => {});
    api.get<Product[]>("/api/public/products?isNew=true&limit=6").then(setNewArrivals).catch(() => {});
    api.get<Offer[]>("/api/public/offers").then(setOffers).catch(() => {});
    api.get<{ rates: GoldRate[] }>("/api/public/gold/current").then((r) => setGold(r.rates.find((x) => x.karat === 22) ?? r.rates[0] ?? null)).catch(() => {});
  }, []);

  const galleryItems: GalleryItem[] = featured
    .filter((p) => p.image)
    .slice(0, 5)
    .map((p) => ({ id: p.slug, title: p.name, subtitle: `${p.karat}K ${p.metalColor}`, image: p.image as string }));

  return (
    <div>
      {/* Hero + circular gallery */}
      <section className="px-4 pt-1">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="eyebrow">Autumn Collection</span>
          <h1 className="mt-1.5 font-serif text-[38px] leading-[1.02]">
            The showroom,<br /><span className="italic text-brand">reimagined.</span>
          </h1>
        </motion.div>

        <div className="relative mt-4 h-[300px] overflow-hidden">
          {galleryItems.length > 0 ? (
            <div className="flex h-full items-center justify-center">
              <CircularGallery items={galleryItems} onItemClick={(slug) => navigate(`/product/${slug}`)} />
            </div>
          ) : (
            <div className="mx-auto h-[224px] w-[168px] animate-pulse rounded-2xl bg-champagne" />
          )}
        </div>
        <p className="-mt-1 text-center text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Swipe to explore · tap to open</p>
      </section>

      {/* Bento: gold + AI */}
      <section className="px-4 pt-6">
        <div className="grid grid-cols-2 gap-3">
          <Link to="/gold-rate" className="col-span-2 flex flex-col justify-between overflow-hidden rounded-3xl border border-brand/20 bg-gradient-to-br from-surface to-background p-5 gold-glow">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.28em] text-brand/80">Live Gold Rate · 22K</span>
              <TrendingUp className="size-4 text-brand" />
            </div>
            <div className="mt-4">
              <div className="font-serif text-4xl text-gradient-gold">{gold?.pricePerGram ? aed(gold.pricePerGram) : "—"}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">per gram · live from market feed</div>
            </div>
          </Link>
          <Link to="/ai/visual-search" className="flex flex-col justify-between rounded-3xl bg-gradient-to-br from-brand to-brand-deep p-4 text-[#14110a] gold-glow">
            <Search className="size-5" />
            <div className="mt-3"><div className="font-serif text-lg leading-tight">Visual Search</div><div className="text-[11px] text-[#14110a]/75">Find it from a photo</div></div>
          </Link>
          <Link to="/ai" className="flex flex-col justify-between rounded-3xl border border-border bg-surface p-4">
            <Sparkles className="size-5 text-brand" />
            <div className="mt-3"><div className="font-serif text-lg leading-tight">AI Studio</div><div className="text-[11px] text-muted-foreground">Catalog &amp; insights</div></div>
          </Link>
        </div>
      </section>

      {/* Collections */}
      {storefront && storefront.collections.filter((c) => c.heroImage).length > 0 && (
        <motion.section {...reveal} className="pt-8">
          <div className="mb-3 flex items-end justify-between px-4">
            <h2 className="font-serif text-[26px]">Collections</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>
            {storefront.collections.filter((c) => c.heroImage).map((c: Collection) => (
              <button key={c.id} onClick={() => navigate(`/catalog?collection=${c.slug}`)} className="min-w-[150px] text-left">
                <div className="aspect-[3/4] overflow-hidden rounded-2xl bg-champagne">
                  <img src={c.heroImage as string} alt="" className="size-full object-cover" />
                </div>
                <div className="mt-2 font-serif text-[17px]">{c.name}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.description}</div>
              </button>
            ))}
          </div>
        </motion.section>
      )}

      {/* New arrivals */}
      <motion.section {...reveal} className="px-4 pt-8">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-serif text-[26px]">New Arrivals</h2>
          <Link to="/catalog?filter=new" className="text-[13px] font-medium text-brand-deep">View all</Link>
        </div>
        <div className="grid grid-cols-2 gap-x-3.5 gap-y-8">
          {newArrivals.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </motion.section>

      {/* Appointment CTA */}
      <motion.section {...reveal} className="px-4 pt-8">
        <div className="flex items-center gap-3.5 rounded-3xl border border-border bg-surface p-5">
          <CalendarClock className="size-6 text-brand" strokeWidth={1.6} />
          <div className="flex-1">
            <div className="font-serif text-xl leading-tight">Book a private viewing</div>
            <div className="text-[12.5px] text-muted-foreground">Unhurried time with an advisor</div>
          </div>
          <button onClick={() => navigate("/appointments")} className="rounded-full bg-gradient-to-br from-brand to-brand-deep px-5 py-2.5 text-sm font-semibold text-[#14110a]">Book</button>
        </div>
      </motion.section>

      {/* Offers */}
      {offers.length > 0 && (
        <motion.section {...reveal} className="pt-8">
          <div className="mb-3 flex items-end justify-between px-4">
            <h2 className="font-serif text-[26px]">Offers</h2>
            <Link to="/offers" className="text-[13px] font-medium text-brand-deep">All</Link>
          </div>
          <div className="flex gap-3 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>
            {offers.map((o) => (
              <Link key={o.id} to="/offers" className="min-w-[230px] overflow-hidden rounded-2xl border border-border bg-surface">
                <div className="aspect-[16/10] bg-champagne">{o.image && <img src={o.image} alt="" className="size-full object-cover opacity-90" />}</div>
                <div className="p-3.5">
                  <div className="font-serif text-[16px] leading-tight">{o.title}</div>
                  <div className="mt-1 inline-flex items-center gap-1 text-[12px] text-brand-deep">Code {o.code} <ArrowUpRight className="size-3.5" /></div>
                </div>
              </Link>
            ))}
          </div>
        </motion.section>
      )}

      {/* Featured signature pieces */}
      {featured.length > 0 && (
        <motion.section {...reveal} className="px-4 pt-8">
          <h2 className="mb-4 font-serif text-[26px]">Signature Pieces</h2>
          <div className="grid grid-cols-2 gap-x-3.5 gap-y-8">
            {featured.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </motion.section>
      )}

      <div className="px-4 pt-10 text-center text-[11px] text-muted-foreground">Powered by DevX Boutique OS · one database with the CRM</div>
    </div>
  );
}
