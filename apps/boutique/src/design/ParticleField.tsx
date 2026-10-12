import { useEffect, useRef } from "react";
import { cn } from "@ui";

/**
 * Glowing gold particle field (canvas). Particles drift and twinkle, link up with fine
 * threads when close, and gather softly around the pointer like dust in a jeweller's lamp.
 * Palette follows the PRD: restrained metallic gold, champagne and peach — no neon hues.
 * Pauses off-screen and in background tabs; reduced-motion users get one still frame.
 */
export function ParticleField({ className, density = 1 }: { className?: string; density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const COLORS = ["#E9C98E", "#D4AF6A", "#F7E2C2", "#C9A06A", "#F3C9B0"]; // gold · champagne · peach

    type P = { x: number; y: number; vx: number; vy: number; r: number; c: string; tw: number; ts: number };
    let W = 0, H = 0, dpr = 1, raf = 0, visible = true, t = 0;
    let parts: P[] = [];
    const mouse = { x: -9999, y: -9999, active: false };

    const seed = () => {
      const n = Math.round(Math.min(150, Math.max(40, (W * H) / 5200)) * density);
      parts = Array.from({ length: n }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.14 - 0.04,
        r: 0.8 + Math.random() ** 2 * 2.8,
        c: COLORS[Math.floor(Math.random() * COLORS.length)],
        tw: Math.random() * Math.PI * 2,
        ts: 0.01 + Math.random() * 0.03,
      }));
    };
    const resize = () => {
      const b = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = b.width; H = b.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const draw = () => {
      t++;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      // pointer halo
      if (mouse.active) {
        const g = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 150);
        g.addColorStop(0, "rgba(240,205,140,0.34)");
        g.addColorStop(1, "rgba(233,201,142,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 150, 0, Math.PI * 2); ctx.fill();
      }

      for (const p of parts) {
        if (!reduced) {
          if (mouse.active) {
            const dx = mouse.x - p.x, dy = mouse.y - p.y, d2 = dx * dx + dy * dy;
            if (d2 < 160 * 160 && d2 > 1) {
              const d = Math.sqrt(d2), f = (1 - d / 160) * 0.05;
              p.vx += (dx / d) * f - (dy / d) * f * 0.6; // gentle pull + swirl
              p.vy += (dy / d) * f + (dx / d) * f * 0.6;
            }
          }
          p.vx *= 0.985; p.vy *= 0.985;
          p.vx += (Math.random() - 0.5) * 0.008; p.vy += (Math.random() - 0.5) * 0.008 - 0.0006;
          p.x += p.vx; p.y += p.vy;
          if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
          if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
          p.tw += p.ts;
        }
        const a = 0.6 + Math.sin(p.tw) * 0.4;
        const glow = p.r * 7;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glow);
        g.addColorStop(0, hexA(p.c, 0.85 * a));
        g.addColorStop(0.35, hexA(p.c, 0.25 * a));
        g.addColorStop(1, hexA(p.c, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, glow, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = hexA("#FFF8EC", Math.min(1, 1.1 * a));
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.75, 0, Math.PI * 2); ctx.fill();
        // occasional four-point glint on the larger particles
        if (p.r > 1.9 && a > 0.8) {
          ctx.strokeStyle = hexA("#FFF6E6", (a - 0.8) * 3);
          ctx.lineWidth = 0.7;
          const s = p.r * 5;
          ctx.beginPath(); ctx.moveTo(p.x - s, p.y); ctx.lineTo(p.x + s, p.y); ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x, p.y + s); ctx.stroke();
        }
      }

      // fine threads between near neighbours
      ctx.lineWidth = 0.7;
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const a = parts[i], b = parts[j];
          const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < 105 * 105) {
            ctx.strokeStyle = `rgba(222,184,112,${0.32 * (1 - Math.sqrt(d2) / 105)})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const loop = () => {
      if (visible && !document.hidden) draw();
      raf = requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      mouse.x = e.clientX - b.left; mouse.y = e.clientY - b.top;
      mouse.active = mouse.x >= 0 && mouse.y >= 0 && mouse.x <= W && mouse.y <= H;
    };
    const onLeave = () => { mouse.active = false; };

    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(canvas);
    const host = canvas.parentElement ?? canvas;
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    if (reduced) draw(); else loop();

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      host.removeEventListener("pointermove", onMove); host.removeEventListener("pointerleave", onLeave);
    };
  }, [density]);

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 size-full", className)} />;
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}
