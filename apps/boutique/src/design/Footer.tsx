import { Link } from "react-router-dom";
import { PoweredBy } from "./Brand";

const cols = [
  { title: "Explore", links: [["Shop all", "/catalog"], ["New arrivals", "/catalog?filter=new"], ["Offers", "/offers"], ["Live gold rate", "/gold-rate"]] },
  { title: "Studio", links: [["Visual search", "/ai/visual-search"], ["AI Studio", "/ai"], ["Book a viewing", "/appointments"]] },
  { title: "Client care", links: [["My account", "/account"], ["My collection", "/account"], ["Inquiry bag", "/cart"]] },
];

export function Footer() {
  return (
    <footer className="mt-24 bg-night pb-[calc(90px+env(safe-area-inset-bottom))] text-on-night md:mt-32 md:pb-28">
      <div className="mx-auto max-w-[1320px] px-5 pt-16 md:px-8 md:pt-20">
        <div className="grid gap-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="font-serif text-[40px] leading-none">Aurelia</div>
            <p className="mt-4 max-w-xs text-[13.5px] leading-relaxed text-on-night/60">
              Fine jewellery from Gold Souk Deira, The Dubai Mall and The Galleria Abu Dhabi. Certified stones, lifetime care.
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <div className="mb-4 text-[12px] font-semibold text-brand-soft">{c.title}</div>
              <ul className="space-y-2.5 text-[14px]">
                {c.links.map(([label, to]) => (
                  <li key={label}><Link to={to} className="text-on-night/70 transition-colors hover:text-on-night">{label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-on-night/10 py-6 text-[12px] text-on-night/50 md:flex-row md:items-center">
          <span>© {new Date().getFullYear()} Aurelia Fine Jewellery LLC</span>
          <PoweredBy tone="light" className="text-[10px]" />
        </div>
      </div>
    </footer>
  );
}
