import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Heart } from "lucide-react";
import { cn } from "@ui";
import { useStore } from "@/context/store";
import type { Product } from "@/lib/types";
import { Badge } from "./Badge";
import { Price } from "./Price";
import { rise } from "./motion";

interface Props { product: Product; size?: "md" | "lg"; className?: string }

/** Image-led card: large photograph, name, price. Everything else lives on the PDP. */
export function ProductCard({ product, size = "md", className }: Props) {
  const { saved, toggleSaved } = useStore();
  const isSaved = saved.includes(product.id);
  const inStock = product.availability?.some((a) => a.quantity > 0);

  return (
    <motion.article variants={rise} className={cn("group relative", className)}>
      <Link to={`/product/${product.slug}`} className="block" aria-label={product.name}>
        <div className={cn("relative overflow-hidden rounded-[18px] bg-champagne", size === "lg" ? "aspect-[3/4]" : "aspect-[4/5]")}>
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition-transform duration-[1400ms] ease-[var(--ease-lux)] group-hover:scale-[1.06]"
            />
          ) : (
            <div className="flex size-full items-center justify-center font-serif text-lg italic text-muted-foreground">Aurelia</div>
          )}
          {/* soft vignette that deepens on hover */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 transition-opacity duration-700 group-hover:opacity-100" />
          <div className="absolute left-3 top-3 flex gap-1.5">
            {product.isNew && <Badge tone="new">New</Badge>}
            {product.discount > 0 && <Badge tone="gold">−{product.discount}%</Badge>}
          </div>
          {/* hover reveal: collection meta */}
          <div className="pointer-events-none absolute inset-x-3 bottom-3 hidden translate-y-2 items-center justify-between text-[11.5px] font-medium text-[#FFFDF8] opacity-0 transition-all duration-700 ease-[var(--ease-lux)] group-hover:translate-y-0 group-hover:opacity-100 md:flex">
            <span>{product.karat}K {product.metalColor}</span>
            <span>{inStock ? "Available in boutique" : "Made to order"}</span>
          </div>
        </div>
      </Link>

      <button
        onClick={() => toggleSaved(product.id)}
        aria-label={isSaved ? "Remove from collection" : "Add to collection"}
        aria-pressed={isSaved}
        className={cn(
          "absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-surface/90 backdrop-blur transition-all duration-500 md:opacity-0 md:group-hover:opacity-100",
          isSaved && "md:opacity-100",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={String(isSaved)} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: "spring", stiffness: 500, damping: 22 }}>
            <Heart className={cn("size-[17px]", isSaved ? "fill-brand text-brand" : "text-foreground/75")} strokeWidth={1.6} />
          </motion.span>
        </AnimatePresence>
      </button>

      <Link to={`/product/${product.slug}`} className="mt-3.5 block px-0.5">
        <h3 className={cn("font-serif leading-tight text-foreground", size === "lg" ? "text-[22px]" : "text-[18px] md:text-[19px]")}>{product.name}</h3>
        <Price priceMode={product.priceMode} basePrice={product.basePrice} discount={product.discount} size="sm" className="mt-1" />
      </Link>
    </motion.article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div>
      <div className="skeleton aspect-[4/5] rounded-[18px]" />
      <div className="skeleton mt-4 h-4 w-3/4 rounded" />
      <div className="skeleton mt-2 h-3 w-1/3 rounded" />
    </div>
  );
}
