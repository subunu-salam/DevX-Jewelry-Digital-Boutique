import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { motion } from "motion/react";
import { useStore } from "@/context/store";
import { priceLabel } from "@/lib/format";
import type { Product } from "@/lib/types";
import { cn } from "@ui";

export default function ProductCard({ product }: { product: Product }) {
  const { saved, toggleSaved } = useStore();
  const isSaved = saved.includes(product.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="group"
    >
      <Link to={`/product/${product.slug}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-champagne">
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No image</div>
          )}
          <div className="absolute left-3 top-3 flex gap-2">
            {product.isNew && (
              <span className="rounded-full bg-background/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-brand-deep backdrop-blur">
                New
              </span>
            )}
            {product.priceMode === "INQUIRY" && (
              <span className="rounded-full border border-brand/25 bg-black/65 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-brand backdrop-blur">
                Enquire
              </span>
            )}
          </div>
          <button
            onClick={(e) => {
              e.preventDefault();
              toggleSaved(product.id);
            }}
            aria-label={isSaved ? "Remove from saved" : "Save"}
            className="absolute right-3 top-3 rounded-full bg-background/85 p-2 opacity-0 backdrop-blur transition-opacity duration-300 group-hover:opacity-100"
          >
            <Heart className={cn("size-4", isSaved ? "fill-brand text-brand" : "text-foreground/70")} />
          </button>
        </div>
      </Link>
      <div className="mt-4 px-0.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link to={`/product/${product.slug}`}>
              <h3 className="font-serif text-lg leading-snug transition-colors group-hover:text-brand">
                {product.name}
              </h3>
            </Link>
            <p className="mt-0.5 text-xs uppercase tracking-wider text-muted-foreground">
              {product.karat}K {product.metalColor} · {product.category?.name}
            </p>
          </div>
          <div className="whitespace-nowrap text-right text-sm font-medium">{priceLabel(product)}</div>
        </div>
      </div>
    </motion.div>
  );
}
