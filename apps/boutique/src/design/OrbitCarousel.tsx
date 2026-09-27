import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AnimatePresence, animate, motion, useAnimationFrame, useMotionTemplate, useMotionValue, useMotionValueEvent,
  useReducedMotion, useTransform, type MotionValue,
} from "motion/react";
import { cn } from "@ui";
import { EASE } from "./motion";

export interface OrbitItem {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  image: string;
}

interface Props {
  items: OrbitItem[];
  onOpen?: (id: string) => void;
  /** degrees per second while idle */
  speed?: number;
  /** "stage" = hero size: larger cards filling the app width */
  size?: "default" | "stage";
  className?: string;
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * A rotatable round catalogue. Cards orbit in 3D; drag/swipe to spin with momentum,
 * it snaps to the nearest piece, auto-rotates when idle, and the front card opens on tap.
 */
export function OrbitCarousel({ items, onOpen, speed = 7, size = "default", className }: Props) {
  const n = items.length;
  const step = 360 / Math.max(n, 1);
  const reduced = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);

  // Card size + ring radius follow the container width (phone → laptop).
  const [dims, setDims] = useState({ w: 180, h: 240, r: 260 });
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const W = el.clientWidth;
      const stage = size === "stage";
      const w = Math.round(stage ? Math.min(300, Math.max(190, W * 0.58)) : Math.min(260, Math.max(150, W * 0.36)));
      const h = Math.round(w * (stage ? 1.34 : 1.3));
      const ideal = (w / 2) / Math.tan(Math.PI / Math.max(n, 3)) + w * (stage ? 0.1 : 0.18);
      const r = Math.round(Math.min(ideal, W * (stage ? 0.75 : 0.62)));
      setDims({ w, h, r });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n, size]);

  const rot = useMotionValue(0);
  const ringTransform = useMotionTemplate`translateZ(-${dims.r}px) rotateY(${rot}deg)`;

  // Which card faces the viewer (drives caption + dots without re-rendering every frame).
  const [active, setActive] = useState(0);
  useMotionValueEvent(rot, "change", (v) => {
    if (!n) return;
    const i = mod(Math.round(-v / step), n);
    setActive((prev) => (prev === i ? prev : i));
  });
  // When the list changes (e.g. new arrivals → featured), reset to the first piece.
  const signature = items.map((i) => i.id).join("|");
  useEffect(() => {
    rot.stop();
    rot.set(0);
    setActive(0);
  }, [signature, rot]);

  const interacting = useRef(false);
  const idleUntil = useRef(0);
  const inView = useRef(true);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { inView.current = e.isIntersecting; });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useAnimationFrame((_, delta) => {
    if (reduced || interacting.current || !inView.current || performance.now() < idleUntil.current || document.hidden) return;
    rot.set(rot.get() - (speed * delta) / 1000);
  });

  const pause = (ms = 3500) => { idleUntil.current = performance.now() + ms; };
  const snapTo = (target: number, velocity = 0) => {
    pause();
    animate(rot, target, { type: "spring", stiffness: 70, damping: 18, velocity });
  };
  const goTo = (i: number) => {
    // shortest path to card i
    const current = rot.get();
    const base = -i * step;
    const k = Math.round((current - base) / 360);
    snapTo(base + k * 360);
  };
  const next = () => snapTo(Math.round(rot.get() / step) * step - step);
  const prev = () => snapTo(Math.round(rot.get() / step) * step + step);

  // Pointer drag with momentum
  const drag = useRef({ x: 0, t: 0, v: 0, moved: 0 });
  const onPointerDown = (e: React.PointerEvent) => {
    interacting.current = true;
    rot.stop();
    drag.current = { x: e.clientX, t: performance.now(), v: 0, moved: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!interacting.current) return;
    const now = performance.now();
    const dx = e.clientX - drag.current.x;
    const deg = dx * (180 / (Math.PI * dims.r)) * 1.1;
    rot.set(rot.get() + deg);
    drag.current.v = (deg / Math.max(now - drag.current.t, 1)) * 1000;
    drag.current.moved += Math.abs(dx);
    drag.current.x = e.clientX;
    drag.current.t = now;
  };
  const onPointerUp = () => {
    if (!interacting.current) return;
    interacting.current = false;
    const v = drag.current.v;
    const projected = rot.get() + v * 0.25; // momentum
    snapTo(Math.round(projected / step) * step, v);
  };

  if (!n) return <div ref={wrap} className={cn("skeleton mx-auto aspect-[4/3] w-full max-w-md rounded-[24px]", className)} />;
  const safeIndex = active < n ? active : 0;
  const current = items[safeIndex];

  return (
    <div className={cn("relative", className)}>
      <div
        ref={wrap}
        role="region"
        aria-roledescription="carousel"
        aria-label="Featured pieces — drag to rotate"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "ArrowRight") next(); if (e.key === "ArrowLeft") prev(); if (e.key === "Enter" && current) onOpen?.(current.id); }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative w-full cursor-grab select-none outline-none active:cursor-grabbing"
        style={{ perspective: `${Math.max(900, dims.r * 3.4)}px`, height: dims.h + 44, touchAction: "pan-y" }}
      >
        {/* soft floor glow */}
        <div className="pointer-events-none absolute inset-x-[15%] bottom-2 h-10 rounded-[50%] bg-brand/20 blur-2xl" />
        <motion.div
          className="absolute left-1/2 top-3"
          style={{ width: dims.w, height: dims.h, marginLeft: -dims.w / 2, transformStyle: "preserve-3d", transform: ringTransform }}
        >
          {items.map((it, i) => (
            <OrbitCard
              key={it.id}
              item={it}
              angle={i * step}
              rot={rot}
              dims={dims}
              isActive={i === safeIndex}
              onTap={() => {
                if (drag.current.moved > 8) return;
                if (i === safeIndex) onOpen?.(it.id);
                else goTo(i);
              }}
            />
          ))}
        </motion.div>

      </div>

      {/* Caption of the front piece */}
      <div className="mt-2 flex min-h-[86px] flex-col items-center text-center" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.button
            key={current.id}
            onClick={() => onOpen?.(current.id)}
            initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
            transition={{ duration: 0.45, ease: EASE }}
            className="group"
          >
            <div className="font-serif text-[26px] leading-tight md:text-[30px]">{current.title}</div>
            <div className="mt-1 text-[13px] text-muted-foreground">
              {[current.subtitle, current.meta].filter(Boolean).join("  ·  ")}
            </div>
            <div className="mt-2 text-[12.5px] font-semibold text-brand-deep underline decoration-brand-soft underline-offset-4 opacity-80 transition group-hover:opacity-100">View piece</div>
          </motion.button>
        </AnimatePresence>
        <div className="mt-3 flex gap-1.5">
          {items.map((it, i) => (
            <button key={it.id} onClick={() => goTo(i)} aria-label={`Show ${it.title}`} className="p-1">
              <motion.span animate={{ width: i === safeIndex ? 18 : 6, opacity: i === safeIndex ? 1 : 0.3 }} transition={{ duration: 0.4, ease: EASE }} className="block h-1.5 rounded-full bg-foreground" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function OrbitCard({
  item, angle, rot, dims, isActive, onTap,
}: { item: OrbitItem; angle: number; rot: MotionValue<number>; dims: { w: number; h: number; r: number }; isActive: boolean; onTap: () => void }) {
  // 0 when facing the viewer, 180 when directly behind
  const facing = useTransform(rot, (v) => { const a = mod(angle + v, 360); return a > 180 ? 360 - a : a; });
  const opacity = useTransform(facing, [0, 70, 120, 180], [1, 0.75, 0.25, 0]);
  const brightness = useTransform(facing, [0, 90], [1, 0.6]);
  const filter = useMotionTemplate`brightness(${brightness})`;

  return (
    <motion.button
      type="button"
      onClick={onTap}
      aria-label={item.title}
      tabIndex={-1}
      className={cn(
        "absolute inset-0 overflow-hidden rounded-[22px] border bg-champagne transition-[border-color,box-shadow] duration-500",
        isActive ? "border-brand/70 shadow-[0_30px_60px_-28px_rgba(0,0,0,.55)]" : "border-border",
      )}
      style={{
        transform: `rotateY(${angle}deg) translateZ(${dims.r}px)`,
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        opacity,
        filter,
      }}
    >
      <img src={item.image} alt="" draggable={false} loading="lazy" className="pointer-events-none size-full object-cover" />
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
    </motion.button>
  );
}