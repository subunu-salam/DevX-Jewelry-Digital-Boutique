import { forwardRef } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { Loader2 } from "lucide-react";
import { cn } from "@ui";

type Variant = "primary" | "gold" | "outline" | "ghost" | "link";
type Size = "sm" | "md" | "lg";

export interface LuxuryButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  full?: boolean;
  children?: React.ReactNode;
}

const base =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-sans font-semibold tracking-[0.02em] transition-[background,color,border-color,box-shadow] duration-500 ease-[var(--ease-lux)] disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  // Charcoal is the primary CTA — gold stays an accent, never a flood.
  primary: "sheen rounded-full bg-ink text-on-ink hover:bg-ink-soft shadow-[var(--shadow-lift)]",
  gold: "sheen rounded-full bg-brand text-[#FFFDF8] hover:brightness-95",
  outline: "rounded-full border border-border-secondary bg-transparent text-foreground hover:border-foreground",
  ghost: "rounded-full text-foreground hover:bg-muted",
  link: "rounded-none px-0! text-foreground underline decoration-brand-soft underline-offset-[6px] hover:decoration-brand-deep",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[12.5px]",
  md: "h-11 px-6 text-[13.5px]",
  lg: "h-14 px-8 text-[14.5px]",
};

/** The one button used everywhere. */
export const LuxuryButton = forwardRef<HTMLButtonElement, LuxuryButtonProps>(function LuxuryButton(
  { variant = "primary", size = "md", loading, icon, iconRight, full, className, children, disabled, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], full && "w-full", className)}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
      {iconRight}
    </motion.button>
  );
});

export function IconButton({
  label, children, className, active, ...rest
}: { label: string; active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-full border transition-all duration-500 ease-[var(--ease-lux)] active:scale-95",
        active ? "border-brand bg-brand/10 text-brand-deep" : "border-border bg-surface/80 text-foreground/80 hover:border-foreground/40 hover:text-foreground",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
