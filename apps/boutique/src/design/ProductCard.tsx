import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Heart } from "lucide-react";
import { cn } from "@ui";
import { useStore } from "@/context/store";
import type { Product } from "@/lib/types";
import { Jewel3DStill } from "./Jewel3DStill";
import { Price } from "./Price";
import { rise } from "./motion";

interface Props { product: Product; size?: "md" | "lg"; className?: string; /** kept for callers; the studio card has its own hover */ interactive?: boolean }

const METAL_SWATCH: Record<string, string> = {
  yellow: "radial-gradient(circle at 35% 30%, #fff3c4, #e9c35f 45%, #8a6416)",
  white: "radial-gradient(circle at 35% 30%, #ffffff, #d9dde2 45%, #868c94)",
  rose: "radial-gradient(circle at 35% 30%, #ffe3d6, #e7ab8f 45%, #91533f)",
};
const swatchOf = (metalColor?: string) => {
  const m = (metalColor ?? "").toLowerCase();
  return METAL_SWATCH[m.includes("rose") ? "rose" : m.includes("white") || m.includes("platinum") || m.includes("silver") ? "white" : "yellow"];
};

/** Studio card: the piece in the 3D studio on a dark well, name, metal, price in gold. */
export function ProductCard({ product, size = "md", className }: Props) {
  const { saved, toggleSaved } = useStore();
  const isSaved = saved.includes(product.id);
  const tag = product.isNew ? "New" : product.discount > 0 ? `−${product.discount}%` : product.tryOn ? "Try on" : null;

  return (
    <motion.article
      variants={rise}
      className={cn(
        "panel-card group relative flex flex-col overflow-hidden rounded-[14px] transition-[transform,border-color,box-shadow] duration-[350ms] hover:-translate-y-1 hover:border-brand hover:shadow-[var(--shadow-lift)]",
        className,
      )}
    >
      <Link to={`/product/${product.slug}`} aria-label={product.name} className="block">
        <div className={cn("relative overflow-hidden bg-[#0d0b0a]", size === "lg" ? "aspect-[4/5]" : "aspect-square")}>
          <Jewel3DStill
            piece={product}
            aspect={size === "lg" ? 4 / 5 : 1}
            imgClassName="transition-transform duration-[1000ms] ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.05]"
          />
          {tag && (
            <span className="absolute left-3 top-3 z-[2] rounded-full border border-border bg-[rgba(10,9,8,.62)] px-2.5 py-[5px] text-[10px] uppercase tracking-[0.16em] text-brand-deep backdrop-blur-md">
              {tag}
            </span>
          )}
        </div>
      </Link>

      <button
        onClick={() => toggleSaved(product.id)}
        aria-label={isSaved ? "Remove from collection" : "Add to collection"}
        aria-pressed={isSaved}
        className="absolute right-3 top-3 z-[2] flex size-9 items-center justify-center rounded-full border border-border bg-[rgba(10,9,8,.6)] backdrop-blur-md transition hover:border-brand"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={String(isSaved)} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: "spring", stiffness: 500, damping: 22 }}>
            <Heart className={cn("size-[17px]", isSaved ? "fill-[#e0a597] text-[#e0a597]" : "text-foreground")} strokeWidth={1.6} />
          </motion.span>
        </AnimatePresence>
      </button>

      <Link to={`/product/${product.slug}`} className="flex flex-1 flex-col gap-[3px] px-[14px] pb-[14px] pt-3">
        <h3 className={cn("font-serif leading-[1.08] text-foreground", size === "lg" ? "text-[23px]" : "text-[19px]")}>{product.name}</h3>
        <span className="truncate text-[12px] text-muted-foreground">{product.karat}K {product.metalColor} {product.metal?.toLowerCase()}</span>
        <span className="mt-2.5 flex items-center justify-between gap-2">
          <Price priceMode={product.priceMode} basePrice={product.basePrice} discount={product.discount} size="sm" className="text-brand-deep" />
          <i aria-hidden className="size-[13px] shrink-0 rounded-full border border-white/25" style={{ background: swatchOf(product.metalColor) }} />
        </span>
      </Link>
    </motion.article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="panel-card overflow-hidden rounded-[14px]">
      <div className="studio-shimmer aspect-square" />
      <div className="space-y-2 p-3.5">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/3 rounded" />
      </div>
    </div>
  );
}
