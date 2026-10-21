import { motion } from "motion/react";
import { cn } from "@ui";
import type { Product } from "@/lib/types";
import { ProductCard, ProductCardSkeleton } from "./ProductCard";
import { stagger } from "./motion";

interface Props {
  products: Product[];
  loading?: boolean;
  columns?: 2 | 3 | 4;
  empty?: React.ReactNode;
  className?: string;
  /** pointer-follow tilt + spotlight on each card */
  interactive?: boolean;
}

const cols = { 2: "grid-cols-2", 3: "grid-cols-2 lg:grid-cols-3", 4: "grid-cols-2 md:grid-cols-3 xl:grid-cols-4" };

/** Staggered grid; re-animates whenever the result set changes. */
export function ProductGrid({ products, loading, columns = 3, empty, className, interactive }: Props) {
  const grid = cn("grid gap-3 sm:gap-5", cols[columns], className);
  if (loading) return <div className={grid}>{Array.from({ length: columns * 2 }).map((_, i) => <ProductCardSkeleton key={i} />)}</div>;
  if (!products.length) return <>{empty}</>;
  return (
    <motion.div key={products.map((p) => p.id).join()} variants={stagger(0.06)} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }} className={grid}>
      {products.map((p) => <ProductCard key={p.id} product={p} interactive={interactive} />)}
    </motion.div>
  );
}
