import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
} from "react";

/** Conditional class-name helper. */
function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export interface GalleryItem {
  id: string;
  title: string;
  subtitle?: string;
  image: string;
  imagePos?: string;
}

interface CircularGalleryProps extends HTMLAttributes<HTMLDivElement> {
  items: GalleryItem[];
  /** How far the cards sit from the centre (px). */
  radius?: number;
  /** Auto-rotation speed (deg/frame) when idle. */
  autoRotateSpeed?: number;
  /** Card width / height in px. */
  cardWidth?: number;
  cardHeight?: number;
  /** Fires when a card is tapped (not dragged). */
  onItemClick?: (id: string) => void;
}

/**
 * A 3D circular gallery. Cards orbit a centre in perspective; the ring
 * auto-rotates when idle, can be dragged / swiped to spin, pauses while held,
 * and reports a tap on the front-facing card. Designed to live in a card on a
 * mobile screen (not the whole page).
 */
export const CircularGallery = forwardRef<HTMLDivElement, CircularGalleryProps>(
  (
    {
      items,
      className,
      radius = 240,
      autoRotateSpeed = 0.12,
      cardWidth = 168,
      cardHeight = 224,
      onItemClick,
      ...props
    },
    ref,
  ) => {
    const [rotation, setRotation] = useState(0);
    const draggingRef = useRef(false);
    const movedRef = useRef(0);
    const lastXRef = useRef(0);
    const rotationRef = useRef(0);
    const rafRef = useRef<number | null>(null);
    const heldRef = useRef(false);
    rotationRef.current = rotation;

    // Auto-rotate when not being held.
    useEffect(() => {
      const tick = () => {
        if (!heldRef.current) {
          setRotation((r) => r + autoRotateSpeed);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }, [autoRotateSpeed]);

    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
      draggingRef.current = true;
      heldRef.current = true;
      movedRef.current = 0;
      lastXRef.current = e.clientX;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;
      movedRef.current += Math.abs(dx);
      setRotation((r) => r + dx * 0.4);
    };
    const endDrag = () => {
      draggingRef.current = false;
      // resume auto-rotate shortly after release
      setTimeout(() => {
        heldRef.current = false;
      }, 600);
    };

    const anglePerItem = 360 / items.length;

    return (
      <div
        ref={ref}
        role="region"
        aria-label="Featured pieces gallery"
        className={cn("relative w-full select-none", className)}
        style={{ perspective: "1100px", touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onPointerCancel={endDrag}
        {...props}
      >
        <div
          className="relative mx-auto"
          style={{
            width: cardWidth,
            height: cardHeight,
            transformStyle: "preserve-3d",
            transform: `translateZ(-${radius}px) rotateY(${rotation}deg)`,
          }}
        >
          {items.map((item, i) => {
            const itemAngle = i * anglePerItem;
            const relative = (((itemAngle + (rotation % 360)) % 360) + 360) % 360;
            const facing = Math.abs(relative > 180 ? 360 - relative : relative); // 0 = front
            const opacity = Math.max(0.35, 1 - facing / 150);
            const isFront = facing < anglePerItem / 2;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.title}
                onClick={() => {
                  if (movedRef.current < 8) onItemClick?.(item.id);
                }}
                className="absolute left-0 top-0 cursor-pointer overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-black/5 p-0 shadow-[0_20px_40px_-24px_rgba(40,30,15,.5)]"
                style={{
                  width: cardWidth,
                  height: cardHeight,
                  transform: `rotateY(${itemAngle}deg) translateZ(${radius}px)`,
                  opacity,
                  transition: "opacity .25s linear",
                  outline: isFront ? "2px solid var(--color-brand)" : "none",
                  outlineOffset: "-2px",
                }}
              >
                <img
                  src={item.image}
                  alt={item.title}
                  draggable={false}
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                  style={{ objectPosition: item.imagePos || "center" }}
                />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-left text-white">
                  <span className="block font-serif text-lg leading-tight">{item.title}</span>
                  {item.subtitle && (
                    <span className="mt-0.5 block text-[11px] uppercase tracking-wider text-white/75">{item.subtitle}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  },
);

CircularGallery.displayName = "CircularGallery";
