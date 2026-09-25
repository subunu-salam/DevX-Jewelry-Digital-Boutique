import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import type { Category, Product, Storefront } from "@/lib/types";
import ProductCard from "@/components/ProductCard";
import { cn } from "@ui";

const KARATS = [24, 22, 21, 18];
const GENDERS = ["Women", "Men", "Unisex"];
const SORTS = [
  { v: "newest", label: "Newest" },
  { v: "price_asc", label: "Price ↑" },
  { v: "price_desc", label: "Price ↓" },
  { v: "name", label: "A–Z" },
];

export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const search = params.get("search") ?? "";
  const collection = params.get("collection") ?? "";
  const category = params.get("category") ?? "";
  const karat = params.get("karat") ?? "";
  const gender = params.get("gender") ?? "";
  const sort = params.get("sort") ?? "newest";
  const onlyNew = params.get("filter") === "new";

  useEffect(() => {
    api.get<Storefront>("/api/public/storefront").then((s) => setCategories(s.categories)).catch(() => {});
  }, []);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (collection) q.set("collection", collection);
    if (category) q.set("category", category);
    if (karat) q.set("karat", karat);
    if (gender) q.set("gender", gender);
    if (onlyNew) q.set("isNew", "true");
    q.set("sort", sort);
    return q.toString();
  }, [search, collection, category, karat, gender, sort, onlyNew]);

  useEffect(() => {
    setLoading(true);
    api
      .get<Product[]>(`/api/public/products?${query}`)
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [query]);

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
      <div className="mb-8">
        <span className="eyebrow">The Collection</span>
        <h1 className="mt-2 font-serif text-4xl sm:text-5xl">
          {search ? `Results for “${search}”` : collection ? collection : "All Jewellery"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{loading ? "Loading…" : `${products.length} pieces`}</p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        {/* Filters */}
        <aside className="space-y-8">
          <FilterGroup title="Category">
            <Chip active={!category} onClick={() => set("category", "")}>All</Chip>
            {categories.map((c) => (
              <Chip key={c.id} active={category === c.slug} onClick={() => set("category", c.slug)}>
                {c.name}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup title="Karat">
            <Chip active={!karat} onClick={() => set("karat", "")}>All</Chip>
            {KARATS.map((k) => (
              <Chip key={k} active={karat === String(k)} onClick={() => set("karat", String(k))}>
                {k}K
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup title="For">
            <Chip active={!gender} onClick={() => set("gender", "")}>Everyone</Chip>
            {GENDERS.map((g) => (
              <Chip key={g} active={gender === g} onClick={() => set("gender", g)}>
                {g}
              </Chip>
            ))}
          </FilterGroup>
        </aside>

        {/* Grid */}
        <div>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs uppercase tracking-wider text-muted-foreground">Sort</span>
            {SORTS.map((s) => (
              <Chip key={s.v} active={sort === s.v} onClick={() => set("sort", s.v)}>
                {s.label}
              </Chip>
            ))}
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-5 md:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-champagne" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface py-24 text-center text-muted-foreground">
              No pieces match these filters.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="eyebrow mb-3">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        active
          ? "border-brand bg-brand text-white"
          : "border-border bg-surface text-foreground/70 hover:border-brand/50 hover:text-brand",
      )}
    >
      {children}
    </button>
  );
}
