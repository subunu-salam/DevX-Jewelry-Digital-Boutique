import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { SlidersHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import type { Product, Storefront } from "@/lib/types";
import {
  ActiveFilter, Drawer, FilterChip, FilterGroup, FilterOption, LuxuryButton, ProductGrid, SearchBar, Select, lineUp, stagger, t,
} from "@/design";

const METALS = ["Gold", "Platinum", "Silver"];
const KARATS = ["24", "22", "21", "18"];
const STONES = ["Diamond", "Emerald", "Ruby", "Sapphire", "Pearl", "Enamel"];
const OCCASIONS = ["Bridal", "Engagement", "Wedding", "Everyday", "Evening", "Festive", "Gift"];
const GENDERS = ["Women", "Men", "Unisex"];
const PRICES = [
  { v: "0-5000", label: "Under AED 5,000" },
  { v: "5000-15000", label: "AED 5,000 – 15,000" },
  { v: "15000-40000", label: "AED 15,000 – 40,000" },
  { v: "40000-", label: "Above AED 40,000" },
];
const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price, low to high" },
  { value: "price_desc", label: "Price, high to low" },
  { value: "name", label: "Name A–Z" },
];
const FILTER_KEYS = ["metal", "karat", "price", "stone", "collection", "branch", "occasion", "gender"] as const;

export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [store, setStore] = useState<Storefront | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);

  const get = (k: string) => params.get(k) ?? "";
  const search = get("search");
  const category = get("category");
  const sort = get("sort") || "newest";
  const onlyNew = get("filter") === "new";

  useEffect(() => { api.get<Storefront>("/api/public/storefront").then(setStore).catch(() => {}); }, []);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    for (const k of ["search", "category", "collection", "karat", "gender", "metal", "stone", "branch", "occasion"]) if (params.get(k)) q.set(k, params.get(k)!);
    const price = params.get("price");
    if (price) { const [min, max] = price.split("-"); if (min) q.set("minPrice", min); if (max) q.set("maxPrice", max); }
    if (onlyNew) q.set("isNew", "true");
    q.set("sort", sort);
    return q.toString();
  }, [params, onlyNew, sort]);

  useEffect(() => {
    setLoading(true);
    api.get<Product[]>(`/api/public/products?${query}`).then(setProducts).catch(() => setProducts([])).finally(() => setLoading(false));
  }, [query]);

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value && next.get(key) !== value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  }
  const setExact = (key: string, value: string) => { const n = new URLSearchParams(params); value ? n.set(key, value) : n.delete(key); setParams(n, { replace: true }); };
  const clearAll = () => { const n = new URLSearchParams(); if (search) n.set("search", search); if (category) n.set("category", category); setParams(n, { replace: true }); };

  const active = FILTER_KEYS.filter((k) => params.get(k)).map((k) => ({ key: k, label: labelFor(k, params.get(k)!, store) }));
  if (onlyNew) active.unshift({ key: "filter" as never, label: "New arrivals" });

  const categoryName = store?.categories.find((c) => c.slug === category)?.name;
  const title = search ? `“${search}”` : categoryName ?? (onlyNew ? "New arrivals" : "Jewellery");

  const filters = (
    <div>
      <FilterGroup title="Metal" count={params.get("metal") ? 1 : 0}>
        {METALS.map((m) => <FilterOption key={m} active={get("metal") === m} onClick={() => set("metal", m)}>{m}</FilterOption>)}
      </FilterGroup>
      <FilterGroup title="Karat" count={params.get("karat") ? 1 : 0}>
        <div className="grid grid-cols-4 gap-2">
          {KARATS.map((k) => (
            <button key={k} onClick={() => set("karat", k)} className={`rounded-lg border py-2 text-[13px] font-semibold transition-all duration-300 ${get("karat") === k ? "border-ink bg-ink text-on-ink" : "border-border bg-surface hover:border-foreground/40"}`}>{k}K</button>
          ))}
        </div>
      </FilterGroup>
      <FilterGroup title="Price" count={params.get("price") ? 1 : 0}>
        {PRICES.map((p) => <FilterOption key={p.v} active={get("price") === p.v} onClick={() => set("price", p.v)}>{p.label}</FilterOption>)}
      </FilterGroup>
      <FilterGroup title="Gemstone" count={params.get("stone") ? 1 : 0}>
        {STONES.map((s) => <FilterOption key={s} active={get("stone") === s} onClick={() => set("stone", s)}>{s}</FilterOption>)}
        <FilterOption active={get("stone") === "none"} onClick={() => set("stone", "none")}>Plain metal</FilterOption>
      </FilterGroup>
      {store && store.collections.length > 0 && (
        <FilterGroup title="Collection" count={params.get("collection") ? 1 : 0} defaultOpen={false}>
          {store.collections.map((c) => <FilterOption key={c.id} active={get("collection") === c.slug} onClick={() => set("collection", c.slug)}>{c.name}</FilterOption>)}
        </FilterGroup>
      )}
      {store && store.branches.length > 0 && (
        <FilterGroup title="Available at" count={params.get("branch") ? 1 : 0} defaultOpen={false}>
          {store.branches.map((b) => <FilterOption key={b.id} active={get("branch") === b.id} onClick={() => set("branch", b.id)} hint={b.city}>{b.name}</FilterOption>)}
        </FilterGroup>
      )}
      <FilterGroup title="Occasion" count={params.get("occasion") ? 1 : 0} defaultOpen={false}>
        {OCCASIONS.map((o) => <FilterOption key={o} active={get("occasion") === o} onClick={() => set("occasion", o)}>{o}</FilterOption>)}
      </FilterGroup>
      <FilterGroup title="For" count={params.get("gender") ? 1 : 0} defaultOpen={false}>
        {GENDERS.map((g) => <FilterOption key={g} active={get("gender") === g} onClick={() => set("gender", g)}>{g}</FilterOption>)}
      </FilterGroup>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1320px] px-4 pb-8 md:px-8">
      {/* Masthead */}
      <motion.header variants={stagger(0.1)} initial="hidden" animate="show" className="pb-6 pt-8 md:pb-10 md:pt-16">
        <h1 className="overflow-hidden font-serif text-[48px] leading-[0.95] md:text-[84px]">
          <AnimatePresence mode="wait">
            <motion.span key={title} variants={lineUp} initial="hidden" animate="show" exit={{ y: "-105%", transition: { duration: 0.35 } }} className="block">{title}</motion.span>
          </AnimatePresence>
        </h1>
        <motion.p variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: t(0.9) } }} className="mt-3 text-[15px] text-muted-foreground md:text-[17px]">
          Explore the collection
        </motion.p>
      </motion.header>

      {/* Search + sort */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SearchBar live value={search} onSearch={(q) => setExact("search", q)} className="md:w-[420px]" />
        <div className="flex items-center justify-between gap-4 md:justify-end">
          <button onClick={() => setDrawer(true)} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-[13px] font-semibold lg:hidden">
            <SlidersHorizontal className="size-4" /> Filters {active.length > 0 && <span className="rounded-full bg-ink px-1.5 text-[10.5px] text-on-ink">{active.length}</span>}
          </button>
          <Select variant="inline" label="Sort by" value={sort} onChange={(e) => setExact("sort", e.target.value === "newest" ? "" : e.target.value)} options={SORTS} />
        </div>
      </div>

      {/* Categories */}
      <LayoutGroup id="cats">
        <div className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          <FilterChip active={!category} onClick={() => setExact("category", "")} layoutGroup="cat">All</FilterChip>
          {store?.categories.map((c) => (
            <FilterChip key={c.id} active={category === c.slug} onClick={() => setExact("category", c.slug)} layoutGroup="cat">{c.name}</FilterChip>
          ))}
        </div>
      </LayoutGroup>

      <div className="mt-8 grid gap-10 lg:grid-cols-[240px_1fr] lg:gap-14">
        <aside className="hidden lg:block">
          <div className="sticky top-28 max-h-[calc(100dvh-8rem)] overflow-y-auto pr-2 no-scrollbar">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-serif text-[22px]">Filters</span>
              {active.length > 0 && <button onClick={clearAll} className="text-[12px] font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground">Clear all</button>}
            </div>
            {filters}
          </div>
        </aside>

        <div>
          <div className="mb-6 flex min-h-8 flex-wrap items-center gap-2">
            <span className="mr-2 text-[13px] text-muted-foreground tabular-nums">{loading ? "Loading pieces…" : `${products.length} ${products.length === 1 ? "piece" : "pieces"}`}</span>
            <AnimatePresence>
              {active.map((a) => <ActiveFilter key={a.key} label={a.label} onRemove={() => setExact(a.key, "")} />)}
            </AnimatePresence>
          </div>
          <ProductGrid
            products={products}
            loading={loading}
            columns={3}
            empty={
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[22px] border border-border bg-surface px-6 py-20 text-center">
                <div className="font-serif text-[32px] italic">Nothing here yet</div>
                <p className="mx-auto mt-2 max-w-sm text-[14px] text-muted-foreground">No pieces match these filters. An advisor can source something similar for you.</p>
                <LuxuryButton variant="outline" className="mt-6" onClick={clearAll}>Clear filters</LuxuryButton>
              </motion.div>
            }
          />
        </div>
      </div>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Filters"
        footer={
          <div className="flex gap-3">
            <LuxuryButton variant="outline" className="flex-1" onClick={clearAll}>Clear</LuxuryButton>
            <LuxuryButton className="flex-[2]" onClick={() => setDrawer(false)}>Show {products.length} pieces</LuxuryButton>
          </div>
        }
      >
        {filters}
      </Drawer>
    </div>
  );
}

function labelFor(key: string, v: string, store: Storefront | null) {
  if (key === "karat") return `${v}K`;
  if (key === "price") return PRICES.find((p) => p.v === v)?.label ?? v;
  if (key === "stone" && v === "none") return "Plain metal";
  if (key === "collection") return store?.collections.find((c) => c.slug === v)?.name ?? v;
  if (key === "branch") return store?.branches.find((b) => b.id === v)?.name ?? "Boutique";
  return v;
}
