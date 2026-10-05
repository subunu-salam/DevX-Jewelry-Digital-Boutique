import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Tag } from "lucide-react";
import { api } from "@/lib/api";
import type { Offer } from "@/lib/types";

export default function Offers() {
  const [offers, setOffers] = useState<Offer[]>([]);
  useEffect(() => {
    api.get<Offer[]>("/api/public/offers").then(setOffers).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 lg:px-10">
      <span className="eyebrow">Limited Time</span>
      <h1 className="mt-2 font-serif text-4xl sm:text-5xl">Offers &amp; New Deals</h1>
      <p className="mt-2 text-sm text-muted-foreground">Driven entirely from live boutique campaigns.</p>

      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {offers.map((o) => (
          <div key={o.id} className="group overflow-hidden rounded-3xl border border-border bg-surface">
            <div className="relative aspect-[16/10] overflow-hidden bg-champagne">
              {o.image && <img src={o.image} alt={o.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />}
              {o.discount > 0 && (
                <span className="absolute left-4 top-4 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background">
                  {o.discount}% value
                </span>
              )}
            </div>
            <div className="p-6">
              <h3 className="font-serif text-xl">{o.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{o.description}</p>
              <div className="mt-4 flex items-center justify-between">
                {o.code && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-brand-deep">
                    <Tag className="size-3.5" /> {o.code}
                  </span>
                )}
                {o.validUntil && (
                  <span className="text-xs text-muted-foreground">Until {new Date(o.validUntil).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>
        ))}
        {offers.length === 0 && (
          <div className="col-span-full rounded-2xl border border-border bg-surface py-20 text-center text-muted-foreground">
            No active offers right now — <Link to="/catalog" className="text-brand">browse the collection</Link>.
          </div>
        )}
      </div>
    </div>
  );
}
