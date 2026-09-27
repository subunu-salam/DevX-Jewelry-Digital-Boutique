import { Link } from "react-router-dom";
import { cn } from "@ui";

/** Boutique wordmark + "Powered by DevX Technologies" line. */
export function Brand({ compact, className, tone = "dark" }: { compact?: boolean; className?: string; tone?: "dark" | "light" }) {
  return (
    <Link to="/" aria-label="Aurelia Fine Jewellery — home" className={cn("group flex flex-col leading-none", className)}>
      <span className="flex items-baseline gap-2">
        <span className={cn("font-serif font-semibold tracking-[-0.01em] transition-colors", compact ? "text-[25px]" : "text-[29px]", tone === "light" ? "text-on-night" : "text-foreground")}>
          Aurelia
        </span>
        <span className="hidden text-[10.5px] font-medium text-brand-deep sm:inline">Fine Jewellery</span>
      </span>
      <PoweredBy className="mt-0.5" tone={tone} />
    </Link>
  );
}

export function PoweredBy({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  // tone="light" = always on a dark surface → always use the light-lettered logo
  return (
    <span className={cn("flex items-center gap-1.5 whitespace-nowrap text-[9px] font-medium", tone === "light" ? "text-on-night/60" : "text-muted-foreground", className)}>
      Powered by
      {tone === "light" ? (
        <img src="/devx-wordmark-dark.png" alt="DevX Technologies" className="h-[22px] w-auto" />
      ) : (
        <>
          <img src="/devx-wordmark-light.png" alt="DevX Technologies" className="logo-for-light h-[22px] w-auto" />
          <img src="/devx-wordmark-dark.png" alt="DevX Technologies" className="logo-for-dark h-[22px] w-auto" />
        </>
      )}
    </span>
  );
}
