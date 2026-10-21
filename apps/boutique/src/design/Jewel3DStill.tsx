import { useEffect, useRef, useState } from "react";
import { cn } from "@ui";
import { API_URL } from "@/lib/api";
import { specFromProduct } from "@/lib/jewel3d/spec";
import { backdropCss } from "@/lib/jewel3d/backdrop";
import { fallbackImage } from "./JewelImage";

interface StillPiece {
  id?: string; slug?: string; name: string; image?: string | null; model3d?: string | null;
  metalColor?: string; stoneType?: string | null; tags?: string[]; category?: { slug: string } | null; tryOn?: { type: string } | null;
}

/** Rendered stills, shared across the whole app for the session (key: piece + frame shape). */
const cache = new Map<string, Promise<string | null>>();

function still(piece: StillPiece, aspect: number): Promise<string | null> {
  const key = `${piece.id ?? piece.slug ?? piece.name}|${piece.model3d ?? ""}|${aspect.toFixed(3)}`;
  let hit = cache.get(key);
  if (!hit) {
    const spec = specFromProduct(piece as Parameters<typeof specFromProduct>[0]);
    hit = !spec
      ? Promise.resolve(null)
      : import("@/lib/jewel3d/still")
          .then(async ({ renderStill }) => {
            const jewel = piece.model3d
              ? await import("@/lib/jewel3d/custom").then(({ loadProductModel }) => loadProductModel(piece.model3d!, API_URL, spec)).catch(() => null)
              : null;
            return renderStill(spec, { jewel: jewel ?? undefined, aspect, height: aspect >= 0.9 ? 720 : 900 });
          })
          .catch(() => null);
    cache.set(key, hit);
  }
  return hit;
}

/**
 * The piece photographed in the 3D studio (dark backdrop, floor reflection). Renders when it
 * scrolls near view; shows the catalogue photo only where 3D isn't possible.
 */
export function Jewel3DStill({ piece, aspect, alt, className, imgClassName, eager }: {
  piece: StillPiece; aspect: number; alt?: string; className?: string; imgClassName?: string; eager?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(!!eager);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (near || !box.current) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: "300px" });
    io.observe(box.current);
    return () => io.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near) return;
    let alive = true;
    setSrc(null); setFailed(false);
    still(piece, aspect).then((u) => { if (!alive) return; if (u) setSrc(u); else setFailed(true); });
    return () => { alive = false; };
  }, [near, piece, aspect]);

  const photo = failed ? (piece.image || fallbackImage(piece as Parameters<typeof fallbackImage>[0])) : null;
  const show = src ?? photo;
  return (
    <div ref={box} className={cn("absolute inset-0", className)} style={{ background: backdropCss() }}>
      {show ? (
        <img
          src={show}
          alt={alt ?? piece.name}
          decoding="async"
          onError={(e) => { const fb = fallbackImage(piece as Parameters<typeof fallbackImage>[0]); if (e.currentTarget.src !== fb) e.currentTarget.src = fb; }}
          className={cn("size-full object-cover animate-[fadeIn_.9s_ease]", imgClassName)}
        />
      ) : (
        <div className="studio-shimmer absolute inset-0" />
      )}
    </div>
  );
}
