import { cn } from "@ui";
import { aed } from "@/lib/format";

interface Props {
  priceMode: string;
  basePrice: number;
  discount?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Price with AED, discount strike-through and on-inquiry state. */
export function Price({ priceMode, basePrice, discount = 0, size = "md", className }: Props) {
  const cls = { sm: "text-[13.5px]", md: "text-base", lg: "font-serif text-[34px] leading-none" }[size];
  if (priceMode === "INQUIRY")
    return <span className={cn(cls, "text-muted-foreground", size === "lg" && "text-[26px] italic", className)}>Price on request</span>;
  const final = discount ? basePrice * (1 - discount / 100) : basePrice;
  return (
    <span className={cn("inline-flex items-baseline gap-2 tabular-nums", className)}>
      <span className={cn(cls, "font-medium text-foreground")}>{aed(final)}</span>
      {discount > 0 && (
        <>
          <s className="text-[12px] text-muted-foreground">{aed(basePrice)}</s>
          <span className="text-[11px] font-semibold text-brand-deep">−{discount}%</span>
        </>
      )}
    </span>
  );
}
