import { useId } from "react";
import { motion } from "motion/react";
import { cn } from "@ui";

interface Props<T extends string> {
  tabs: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  variant?: "pill" | "underline";
  className?: string;
}

/** Tabs with a shared-layout indicator that glides between options. */
export function Tabs<T extends string>({ tabs, value, onChange, variant = "underline", className }: Props<T>) {
  const id = useId();
  return (
    <div role="tablist" className={cn("no-scrollbar flex overflow-x-auto", variant === "pill" ? "gap-1 rounded-full border border-border bg-surface p-1" : "gap-6 border-b border-border", className)}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative shrink-0 whitespace-nowrap text-[13.5px] font-semibold transition-colors duration-300",
              variant === "pill" ? "rounded-full px-4 py-2" : "pb-3 pt-1",
              active ? (variant === "pill" ? "text-on-ink" : "text-foreground") : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={`tab-${id}`}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
                className={cn("absolute", variant === "pill" ? "inset-0 rounded-full bg-ink" : "inset-x-0 -bottom-px h-px bg-foreground")}
              />
            )}
            <span className="relative">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
