import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Search, Camera, LineChart, ChevronRight } from "lucide-react";

const ITEMS = [
  { to: "/ai/visual-search", icon: Search, title: "AI Visual Search", desc: "A customer uploads a photo — we find the closest pieces in live inventory." },
  { to: "/ai/catalog-studio", icon: Camera, title: "AI Catalog Studio", desc: "Photograph a new piece → AI drafts category, tags, description, SEO & a WhatsApp card, then publishes it to the CRM." },
  { to: "/ai/intelligence", icon: LineChart, title: "Jewelry Intelligence", desc: "Owner insights computed from real sales, stock and conversion data." },
];

export default function AIStudio() {
  return (
    <div className="px-4 pt-2">
      <span className="eyebrow">Powered by AI</span>
      <h1 className="mt-1.5 font-serif text-3xl">AI Studio</h1>
      <div className="mt-4 space-y-3">
        {ITEMS.map((it, i) => (
          <motion.div key={it.to} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}>
            <Link to={it.to} className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface p-4">
              <span className="flex size-12 flex-none items-center justify-center rounded-2xl bg-sand text-brand-deep">
                <it.icon className="size-6" strokeWidth={1.6} />
              </span>
              <span className="flex-1">
                <span className="block font-serif text-xl leading-tight">{it.title}</span>
                <span className="mt-1 block text-[12.5px] leading-snug text-muted-foreground">{it.desc}</span>
              </span>
              <ChevronRight className="size-5 flex-none text-muted-foreground" />
            </Link>
          </motion.div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Everything here reads and writes the same database as the CRM.
      </p>
    </div>
  );
}
