import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown, Sparkles, X } from "lucide-react";
import { cn } from "@ui";

/* Palette (mirrors index.css tokens) for charts */
export const GOLD = "#d4af6a";
export const GOLD_SHADES = ["#d4af6a", "#f0d9a8", "#a8854a", "#e6c88f", "#7d6236", "#c9b48a"];
/** Categorical palette for multi-series charts — fixed order, validated on the dark surface
 *  (#16171c): lightness band, chroma floor, CVD separation ≥ 10.7, normal-vision ≥ 25.9, contrast ≥ 3:1. */
export const CAT = ["#b7810f", "#2a75ba", "#d66f71", "#357426"];
export const INK = "#e9eaee";
export const MUTED = "#8b93a3";
export const GRID = "#262932";
export const tooltipStyle = { background: "#16171c", border: "1px solid #2f323c", borderRadius: 12, fontSize: 12, color: INK, boxShadow: "0 12px 30px -12px rgba(0,0,0,.7)" };

export const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Animated count-up (eases out). */
export function useCountUp(target: number, ms = 1200) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reducedMotion()) { setV(target); from.current = target; return; }
    const start = from.current, t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const val = start + (target - start) * (1 - Math.pow(1 - p, 3));
      setV(val);
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
export function Count({ value, format = (n: number) => Math.round(n).toLocaleString("en") }: { value: number; format?: (n: number) => string }) {
  return <>{format(useCountUp(value))}</>;
}

export const aedShort = (n: number) =>
  n >= 1e6 ? `AED ${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `AED ${Math.round(n / 1e3)}k` : n >= 1e3 ? `AED ${(n / 1e3).toFixed(1)}k` : `AED ${Math.round(n)}`;

export const initials = (name: string) => name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "G";

/** Segmented control with a sliding gold indicator. */
export function Segmented<T extends string>({ options, value, onChange, className }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; className?: string }) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div role="tablist" className={cn("relative inline-grid rounded-lg border border-border bg-card p-0.5 text-xs", className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 rounded-md bg-primary shadow-[0_0_18px_-6px_rgba(212,175,106,.7)] transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)]"
        style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${idx * 100}%)` }}
      />
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)} className={cn("relative z-10 rounded-md px-3 py-1.5 font-medium transition-colors duration-300", o.value === value ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Circular score / percentage ring that fills on mount. */
export function Ring({ value, size = 44, stroke = 4, color = GOLD, children, className }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode; className?: string }) {
  const v = useCountUp(value, 1100);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={GRID} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, v)) / 100)} />
      </svg>
      <span className="relative text-[11px] font-semibold tabular-nums">{children ?? Math.round(v)}</span>
    </span>
  );
}

export const BAND = {
  hot: { label: "Hot", color: "#f2a65a", cls: "bg-[#2a1d10] text-[#f2a65a]" },
  warm: { label: "Warm", color: GOLD, cls: "bg-warning-bg text-primary" },
  cool: { label: "Cool", color: "#7c93b8", cls: "bg-info-bg text-info" },
} as const;

/** Right-side drawer (bottom sheet on phones). */
export function Drawer({ open, onClose, title, subtitle, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) { setMounted(true); requestAnimationFrame(() => requestAnimationFrame(() => setShown(true))); }
    else { setShown(false); const t = setTimeout(() => setMounted(false), 380); return () => clearTimeout(t); }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div onClick={onClose} className={cn("absolute inset-0 bg-black/55 backdrop-blur-[2px] transition-opacity duration-300", shown ? "opacity-100" : "opacity-0")} />
      <aside
        className={cn(
          "absolute flex flex-col border-border bg-card shadow-[0_0_60px_-10px_rgba(0,0,0,.8)] transition-transform duration-[420ms] ease-[cubic-bezier(.22,1,.36,1)]",
          "inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl border-t sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[440px] sm:rounded-none sm:border-l sm:border-t-0",
          shown ? "translate-x-0 translate-y-0" : "translate-y-full sm:translate-x-full sm:translate-y-0",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-[17px] font-semibold tracking-tight">{title}</div>
            {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-border px-5 py-3.5">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

/* ── Toasts ── */
type ToastT = { id: number; text: string; tone?: "ok" | "warn" };
const ToastCtx = createContext<(text: string, tone?: "ok" | "warn") => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastT[]>([]);
  const push = useCallback((text: string, tone: "ok" | "warn" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((p) => [...p.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((p) => p.filter((t) => t.id !== id)), 2800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div aria-live="polite" className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-2">
          {items.map((t) => (
            <div key={t.id} className="toast-in pointer-events-auto flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm shadow-[0_18px_40px_-16px_rgba(0,0,0,.8)]">
              <span className={cn("size-2 rounded-full", t.tone === "warn" ? "bg-warning" : "bg-primary")} />
              {t.text}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

/* ── AI insight card ── */
export interface Recommendation { id: string; category: string; title: string; detail: string; impact: string; confidence: number; action?: { label: string; to: string } }

export function InsightCard({ rec, delay = 0 }: { rec: Recommendation; delay?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rise group rounded-xl border border-border bg-muted/40 transition-colors duration-300 hover:border-primary/40" style={{ ["--d" as string]: `${delay}ms` } as React.CSSProperties}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-3 p-3.5 text-left">
        <Ring value={rec.confidence} size={40} stroke={3.5} />
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-primary/80">{rec.category}</span>
          <span className="mt-0.5 block text-[13.5px] font-medium leading-snug">{rec.title}</span>
          <span className="mt-1 block text-[11.5px] text-muted-foreground">{rec.impact}</span>
        </span>
        <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-300", open && "rotate-180")} />
      </button>
      <div className="grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(.22,1,.36,1)]" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          <div className="px-3.5 pb-3.5 pl-[66px] text-[12.5px] leading-relaxed text-foreground/80">
            {rec.detail}
            <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>{rec.confidence}% confidence</span>
              {rec.action && <Link to={rec.action.to} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">{rec.action.label} <ArrowRight className="size-3" /></Link>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DemoBadge({ source, note }: { source?: "live" | "demo"; note?: string }) {
  if (!source) return null;
  return (
    <span title={note} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium", source === "demo" ? "border-warning/30 bg-warning-bg text-warning" : "border-success/30 bg-success-bg text-success")}>
      <Sparkles className="size-3" /> {source === "demo" ? "AI insights · demo data" : "AI insights · live data"}
    </span>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">{text}</div>;
}

export function SectionHeader({ title, right, link }: { title: ReactNode; right?: ReactNode; link?: { to: string; label: string } }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      {right}
      {link && (
        <Link to={link.to} className="group inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary">
          {link.label} <ArrowRight className="size-3 transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
