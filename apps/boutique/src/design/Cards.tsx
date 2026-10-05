import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { animate, motion, useInView } from "motion/react";
import { CalendarClock, Clock, MapPin, Phone, TrendingUp } from "lucide-react";
import { cn } from "@ui";
import { aed } from "@/lib/format";
import type { Branch, GoldRate, Offer } from "@/lib/types";
import { Badge } from "./Badge";
import { LuxuryButton } from "./Button";

/** Number that counts up when it scrolls into view. */
export function CountUp({ value, format = (n: number) => aed(n) }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const fmt = useRef(format);
  fmt.current = format;
  useEffect(() => {
    if (!inView || !ref.current) return;
    const c = animate(value * 0.92, value, { duration: 1.6, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => { if (ref.current) ref.current.textContent = fmt.current(v); } });
    return () => c.stop();
  }, [inView, value]);
  return <span ref={ref} className="tabular-nums">{format(value)}</span>;
}

export function GoldRateCard({ rate, variant = "light", className }: { rate: GoldRate | null; variant?: "light" | "dark"; className?: string }) {
  const dark = variant === "dark";
  return (
    <Link
      to="/gold-rate"
      className={cn(
        "group relative block overflow-hidden rounded-[22px] border p-5 transition-shadow duration-700 hover:shadow-[var(--shadow-lift)] md:p-6",
        dark ? "border-transparent bg-night text-on-night" : "border-border bg-surface",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("inline-flex items-center gap-2 text-[12px] font-semibold", dark ? "text-brand-soft" : "text-brand-deep")}>
          <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-ok" /></span>
          Live gold · {rate?.karat ?? 22}K
        </span>
        <TrendingUp className={cn("size-4 transition-transform duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5", dark ? "text-brand-soft" : "text-brand")} />
      </div>
      <div className="mt-5 font-serif text-[40px] leading-none md:text-[46px]">
        {rate?.pricePerGram ? <CountUp value={rate.pricePerGram} format={(n) => aed(Math.round(n * 100) / 100).replace(".00", "")} /> : "—"}
      </div>
      <div className={cn("mt-1.5 text-[12.5px]", dark ? "text-on-night/60" : "text-muted-foreground")}>per gram, updated from the market feed</div>
    </Link>
  );
}

export function BranchCard({ branch, stock, onBook, className }: { branch: Branch; stock?: number; onBook?: () => void; className?: string }) {
  return (
    <div className={cn("rounded-[18px] border border-border bg-surface p-5 transition-colors duration-500 hover:border-border-secondary", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-serif text-[21px] leading-tight">{branch.name}</div>
          <div className="mt-0.5 text-[12.5px] text-muted-foreground">{branch.city}</div>
        </div>
        {stock != null && (stock > 0 ? <Badge tone="ok">In boutique</Badge> : <Badge>By order</Badge>)}
      </div>
      <div className="mt-4 space-y-1.5 text-[13px] text-foreground/75">
        {branch.address && <p className="flex gap-2"><MapPin className="mt-0.5 size-3.5 shrink-0 text-brand" />{branch.address}</p>}
        {branch.hours && <p className="flex gap-2"><Clock className="mt-0.5 size-3.5 shrink-0 text-brand" />{branch.hours}</p>}
        {branch.phone && <a href={`tel:${branch.phone}`} className="flex gap-2 hover:text-foreground"><Phone className="mt-0.5 size-3.5 shrink-0 text-brand" />{branch.phone}</a>}
      </div>
      {onBook && <LuxuryButton variant="outline" size="sm" className="mt-4" onClick={onBook}>Book at this boutique</LuxuryButton>}
    </div>
  );
}

export function OfferCard({ offer, className }: { offer: Offer; className?: string }) {
  return (
    <motion.div whileHover="hover" className={cn("group relative overflow-hidden rounded-[22px] bg-night text-on-night", className)}>
      <div className="aspect-[16/11] overflow-hidden">
        {offer.image && (
          <motion.img variants={{ hover: { scale: 1.05 } }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} src={offer.image} alt="" className="size-full object-cover opacity-80" />
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-night via-night/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5">
        {offer.discount > 0 && <div className="font-serif text-[15px] italic text-brand-soft">Up to {offer.discount}% off</div>}
        <div className="mt-1 font-serif text-[24px] leading-tight">{offer.title}</div>
        <div className="mt-3 flex items-center justify-between gap-3 text-[12px]">
          {offer.code && <span className="rounded-full border border-on-night/25 px-3 py-1 font-semibold tracking-[0.12em]">{offer.code}</span>}
          {offer.validUntil && <span className="text-on-night/60">Until {new Date(offer.validUntil).toLocaleDateString("en-AE", { day: "numeric", month: "short" })}</span>}
        </div>
      </div>
    </motion.div>
  );
}

export function AppointmentCard({ title = "Book a private viewing", body = "An unhurried hour with an advisor, in the boutique of your choice.", image, className }: { title?: string; body?: string; image?: string | null; className?: string }) {
  const navigate = useNavigate();
  return (
    <div className={cn("grid overflow-hidden rounded-[26px] bg-night text-on-night md:grid-cols-[1.1fr_1fr]", className)}>
      <div className="flex flex-col justify-between gap-8 p-7 md:p-12">
        <CalendarClock className="size-6 text-brand-soft" strokeWidth={1.4} />
        <div>
          <h3 className="font-serif text-[34px] leading-[1.02] md:text-[52px]">{title}</h3>
          <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-on-night/65">{body}</p>
          <LuxuryButton variant="gold" size="lg" className="mt-7" onClick={() => navigate("/appointments")}>Reserve a time</LuxuryButton>
        </div>
      </div>
      {image && (
        <div className="relative hidden min-h-[320px] overflow-hidden md:block">
          <motion.img initial={{ scale: 1.15 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ duration: 2.2, ease: [0.22, 1, 0.36, 1] }} src={image} alt="" className="absolute inset-0 size-full object-cover" />
        </div>
      )}
    </div>
  );
}
