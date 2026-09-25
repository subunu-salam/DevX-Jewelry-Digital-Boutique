import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { BadgeCheck, Check, Heart, MapPin, Share2, ShieldCheck } from "lucide-react";
import { MetallicButton, cn } from "@ui";
import { api } from "@/lib/api";
import { priceLabel } from "@/lib/format";
import { useStore } from "@/context/store";
import type { Product } from "@/lib/types";

export default function ProductDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addToCart, saved, toggleSaved } = useStore();
  const [product, setProduct] = useState<Product | null>(null);
  const [active, setActive] = useState(0);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setProduct(null);
    api.get<Product>(`/api/public/products/${slug}`).then(setProduct).catch(() => setProduct(null));
    window.scrollTo({ top: 0 });
  }, [slug]);

  if (!product) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="aspect-square animate-pulse rounded-3xl bg-champagne" />
          <div className="space-y-4">
            <div className="h-8 w-2/3 animate-pulse rounded bg-champagne" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-champagne" />
          </div>
        </div>
      </div>
    );
  }

  const images = product.media?.length ? product.media.map((m) => m.url) : product.image ? [product.image] : [];
  const isSaved = saved.includes(product.id);
  const inStock = product.availability.filter((a) => a.quantity > 0);

  const specs: [string, string | number | null | undefined][] = [
    ["SKU", product.sku],
    ["Metal", `${product.karat}K ${product.metalColor} ${product.metal}`],
    ["Gross weight", `${product.grossWeight} g`],
    ["Net weight", `${product.netWeight} g`],
    ["Stone", product.stoneType ? `${product.stoneType}${product.totalCarat ? ` · ${product.totalCarat} ct` : ""}` : "—"],
    ["Stones", product.stoneCount || "—"],
    ["Dimensions", product.dimensions || "—"],
    ["Occasion", product.occasion || "—"],
  ];

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
      <nav className="mb-6 text-xs text-muted-foreground">
        <Link to="/catalog" className="hover:text-brand">Collection</Link>
        <span className="mx-2">/</span>
        {product.category && <Link to={`/catalog?category=${product.category.slug}`} className="hover:text-brand">{product.category.name}</Link>}
        <span className="mx-2">/</span>
        <span className="text-foreground/70">{product.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Gallery */}
        <div>
          <div className="aspect-square overflow-hidden rounded-3xl bg-champagne">
            {images[active] && <img src={images[active]} alt={product.name} className="h-full w-full object-cover" />}
          </div>
          {images.length > 1 && (
            <div className="mt-4 flex gap-3">
              {images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className={cn("h-20 w-20 overflow-hidden rounded-xl border-2", active === i ? "border-brand" : "border-transparent")}
                >
                  <img src={img} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <span className="eyebrow">{product.collection?.name ?? product.category?.name}</span>
          <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">{product.name}</h1>
          <div className="mt-4 flex items-center gap-4">
            <span className="text-2xl font-medium">{priceLabel(product)}</span>
            {product.priceMode === "INQUIRY" && (
              <span className="rounded-full border border-brand/30 bg-black/70 px-3 py-1 text-xs text-brand backdrop-blur">Price on inquiry</span>
            )}
          </div>

          <p className="mt-5 max-w-lg leading-relaxed text-muted-foreground">{product.description}</p>

          {/* Trust badges */}
          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            {product.certNumber && (
              <span className="inline-flex items-center gap-1.5 text-brand-deep">
                <BadgeCheck className="size-4" /> {product.certIssuer} certified · {product.certNumber}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-brand-deep">
              <ShieldCheck className="size-4" /> {product.warranty}
            </span>
          </div>

          {/* CTAs */}
          <div className="mt-8 flex items-center gap-4">
            <MetallicButton
              label={added ? "Added to bag" : "Add to bag"}
              onClick={() => {
                addToCart(product);
                setAdded(true);
                setTimeout(() => setAdded(false), 1600);
              }}
            />
            <button
              onClick={() => toggleSaved(product.id)}
              className="inline-flex size-11 items-center justify-center rounded-full border border-border hover:border-brand"
              aria-label="Save"
            >
              <Heart className={cn("size-5", isSaved ? "fill-brand text-brand" : "text-foreground/70")} />
            </button>
            <button
              onClick={() => navigator.share?.({ title: product.name, url: window.location.href }).catch(() => {})}
              className="inline-flex size-11 items-center justify-center rounded-full border border-border hover:border-brand"
              aria-label="Share"
            >
              <Share2 className="size-5 text-foreground/70" />
            </button>
          </div>
          <button onClick={() => navigate("/appointments")} className="mt-4 text-sm text-foreground/70 underline-offset-4 hover:text-brand hover:underline">
            Prefer to see it in person? Book a private viewing →
          </button>

          {/* Availability */}
          <div className="mt-8 rounded-2xl border border-border bg-surface p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <MapPin className="size-4 text-brand" /> Branch availability
            </div>
            <div className="space-y-2">
              {product.availability.map((a) => (
                <div key={a.branchId} className="flex items-center justify-between text-sm">
                  <span>{a.branchName}</span>
                  {a.quantity > 0 ? (
                    <span className="inline-flex items-center gap-1 text-green-700"><Check className="size-3.5" /> In stock</span>
                  ) : (
                    <span className="text-muted-foreground">Order in</span>
                  )}
                </div>
              ))}
            </div>
            {inStock.length === 0 && (
              <p className="mt-3 text-xs text-muted-foreground">Not in stock — submit an inquiry and an advisor will source it for you.</p>
            )}
          </div>

          {/* Specs */}
          <div className="mt-8">
            <h3 className="eyebrow mb-3">Details</h3>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              {specs.map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-border/60 pb-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium text-right">{v ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
