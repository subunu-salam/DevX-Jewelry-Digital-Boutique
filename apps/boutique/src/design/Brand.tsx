import { Link } from "react-router-dom";
import { cn } from "@ui";

/**
 * Aurelia wordmark — a hairline gold monogram and a tracked serif wordmark,
 * with the "Fine Jewellery · Dubai" line beneath (PRD: restrained, editorial luxury).
 */
export function Brand({ compact, className, tone = "dark" }: { compact?: boolean; className?: string; tone?: "dark" | "light" }) {
  const ink = tone === "light" ? "text-on-night" : "text-foreground";
  return (
    <Link to="/" aria-label="Aurelia Fine Jewellery — home" className={cn("group flex shrink-0 items-center gap-2.5", className)}>
      <span
        aria-hidden
        className={cn(
          "relative flex items-center justify-center rounded-full border border-brand/70 font-serif italic leading-none text-brand-deep transition-transform duration-700 ease-[var(--ease-lux)] group-hover:rotate-[8deg]",
          compact ? "size-9 text-[20px]" : "size-11 text-[24px]",
        )}
      >
        <span className="-mt-0.5">A</span>
        <span className="absolute inset-[3px] rounded-full border border-brand/25" />
      </span>
      <span className="flex flex-col leading-none">
        <span className={cn("font-serif font-semibold uppercase tracking-[0.22em]", compact ? "text-[19px]" : "text-[23px]", ink)}>Aurelia</span>
        <span className="mt-1.5 flex items-center gap-1.5 text-[8.5px] font-semibold uppercase tracking-[0.3em] text-brand-deep">
          <span className="h-px w-3 bg-brand/60" />
          Fine Jewellery
        </span>
      </span>
    </Link>
  );
}

/** Kept for compatibility; no longer shown in the interface. */
export function PoweredBy(_: { className?: string; tone?: "dark" | "light" }) {
  return null;
}
