import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Minus, Plus } from "lucide-react";
import { cn } from "@ui";
import { EASE } from "./motion";

/** Collapsible filter section for the catalogue sidebar / drawer. */
export function FilterGroup({ title, children, defaultOpen = true, count }: { title: string; children: React.ReactNode; defaultOpen?: boolean; count?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border py-4 first:pt-0">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between text-left">
        <span className="text-[13.5px] font-semibold">
          {title}
          {!!count && <span className="ml-2 rounded-full bg-brand/15 px-1.5 text-[10.5px] text-brand-deep">{count}</span>}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.4, ease: EASE }} className="text-muted-foreground">
          {open ? <Minus className="size-3.5" /> : <Plus className="size-3.5" />}
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE }} className="overflow-hidden"
          >
            <div className="pt-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Radio-style option row with an animated check. */
export function FilterOption({ active, onClick, children, hint }: { active: boolean; onClick: () => void; children: React.ReactNode; hint?: string }) {
  return (
    <button onClick={onClick} className="group flex w-full items-center gap-3 py-1.5 text-left text-[13.5px]">
      <span className={cn("flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-all duration-300", active ? "border-ink bg-ink" : "border-border-secondary bg-surface group-hover:border-foreground/50")}>
        <AnimatePresence>
          {active && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 600, damping: 28 }}>
              <Check className="size-3 text-on-ink" strokeWidth={3} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className={cn("flex-1 transition-colors", active ? "text-foreground" : "text-foreground/75 group-hover:text-foreground")}>{children}</span>
      {hint && <span className="text-[11.5px] text-muted-foreground">{hint}</span>}
    </button>
  );
}

/** Horizontal category pill with sliding active fill. */
export function FilterChip({ active, onClick, children, layoutGroup = "chips" }: { active: boolean; onClick: () => void; children: React.ReactNode; layoutGroup?: string }) {
  return (
    <button onClick={onClick} className={cn("relative shrink-0 rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors duration-300", active ? "border-ink text-on-ink" : "border-border bg-surface text-foreground/75 hover:border-foreground/40 hover:text-foreground")}>
      {active && <motion.span layoutId={`chip-${layoutGroup}`} transition={{ type: "spring", stiffness: 420, damping: 36 }} className="absolute inset-0 rounded-full bg-ink" />}
      <span className="relative">{children}</span>
    </button>
  );
}

export function ActiveFilter({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <motion.button
      layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      onClick={onRemove}
      className="inline-flex items-center gap-1.5 rounded-full bg-champagne px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-brand-soft/60"
    >
      {label} <span aria-hidden className="text-muted-foreground">×</span>
    </motion.button>
  );
}
