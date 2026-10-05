import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@ui";
import { EASE } from "./motion";

export interface ShowcaseItem {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  image: string;
}

interface Props { items: ShowcaseItem[]; onOpen?: (id: string) => void; interval?: number; className?: string }

/**
 * A quiet hero: one piece at a time inside an arched frame.
 * Slow cross-fade with a gentle settle, a numbered index and a thin progress line.
 * Swipe or tap the index to move; it pauses while touched and when off-screen.
 */
export function Showcase({ items, onOpen, interval = 5500, className }: Props) {
  const n = items.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => { setI(0); }, [items.map((x) => x.id).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (n < 2 || paused || reduced || !visible) return;
    const t = window.setTimeout(() => setI((v) => (v + 1) % n), interval);
    return () => clearTimeout(t);
  }, [i, n, paused, reduced, visible, interval]);

  if (!n) return <div ref={ref} className={cn("skeleton mx-auto aspect-[4/5] w-[78%]", className)} style={{ borderRadius: "999px 999px 22px 22px" }} />;
  const safe = i < n ? i : 0;
  const item = items[safe];
  const go = (k: number) => setI(((k % n) + n) % n);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <div className="relative mx-auto w-[78%]">
        {/* hairline arch echo */}
        <div aria-hidden className="pointer-events-none absolute -inset-2.5 border border-brand/35" style={{ borderRadius: "999px 999px 28px 28px" }} />

        <motion.div
          className="relative aspect-[4/5] cursor-pointer overflow-hidden bg-champagne"
          style={{ borderRadius: "999px 999px 22px 22px" }}
          onClick={() => onOpen?.(item.id)}
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
          drag={n > 1 ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={(_, info) => { if (info.offset.x < -50) go(safe + 1); else if (info.offset.x > 50) go(safe - 1); }}
        >
          <AnimatePresence initial={false}>
            <motion.img
              key={item.id}
              src={item.image}
              alt={item.title}
              draggable={false}
              initial={{ opacity: 0, scale: 1.08 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ opacity: { duration: 1.2, ease: EASE }, scale: { duration: 6, ease: "linear" } }}
              className="absolute inset-0 size-full select-none object-cover"
            />
          </AnimatePresence>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
        </motion.div>
      </div>

      {/* caption */}
      <div className="mt-6 flex flex-col items-center text-center" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.button
            key={item.id}
            onClick={() => onOpen?.(item.id)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="group"
          >
            <div className="font-serif text-[26px] leading-tight">{item.title}</div>
            <div className="mt-1 text-[12.5px] text-muted-foreground">{[item.subtitle, item.meta].filter(Boolean).join("  ·  ")}</div>
            <div className="mt-2 text-[12px] font-semibold text-brand-deep underline decoration-brand-soft underline-offset-4 opacity-80 transition group-hover:opacity-100">View piece</div>
          </motion.button>
        </AnimatePresence>

        {/* index + progress */}
        {n > 1 && (
          <div className="mt-5 flex w-[78%] items-center gap-3">
            <span className="font-serif text-[15px] tabular-nums text-foreground">{String(safe + 1).padStart(2, "0")}</span>
            <div className="flex flex-1 gap-1.5">
              {items.map((it, k) => (
                <button key={it.id} onClick={() => go(k)} aria-label={`Show ${it.title}`} className="relative h-4 flex-1">
                  <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border-secondary" />
                  {k === safe && (
                    <motion.span
                      key={`${it.id}-${paused}`}
                      className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-brand"
                      initial={{ width: "0%" }}
                      animate={{ width: paused || reduced ? "100%" : "100%" }}
                      transition={{ duration: paused || reduced ? 0.3 : interval / 1000, ease: "linear" }}
                    />
                  )}
                  {k < safe && <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-brand/50" />}
                </button>
              ))}
            </div>
            <span className="font-serif text-[15px] tabular-nums text-muted-foreground">{String(n).padStart(2, "0")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
