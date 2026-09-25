import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Home, LayoutGrid, Sparkles, TrendingUp, ShoppingBag, User, Search } from "lucide-react";
import { useStore } from "@/context/store";

const TABS = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/catalog", label: "Shop", icon: LayoutGrid },
  { to: "/ai", label: "Studio", icon: Sparkles },
  { to: "/gold-rate", label: "Gold", icon: TrendingUp },
  { to: "/cart", label: "Bag", icon: ShoppingBag },
];

export default function MobileShell({ children }: { children: React.ReactNode }) {
  const { cart } = useStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const count = cart.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-background shadow-[0_0_60px_-30px_rgba(40,30,15,.4)]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/90 px-4 pb-2.5 pt-3.5 backdrop-blur">
        <Link to="/" className="leading-none">
          <span className="font-serif text-[26px] font-semibold tracking-tight">Aurelia</span>
          <span className="mt-0.5 block text-[8.5px] font-medium uppercase tracking-[0.34em] text-brand-deep">Fine Jewellery · Dubai</span>
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => navigate("/catalog")} className="flex size-9 items-center justify-center rounded-full border border-border bg-surface" aria-label="Search">
            <Search className="size-[18px]" />
          </button>
          <button onClick={() => navigate("/account")} className="flex size-9 items-center justify-center rounded-full border border-border bg-surface" aria-label="Account">
            <User className="size-[18px]" />
          </button>
        </div>
      </header>

      <main className="flex-1 pb-24">{children}</main>

      {/* Bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[480px] border-t border-border bg-surface/95 px-2 pb-[calc(8px+env(safe-area-inset-bottom,0px))] pt-2 backdrop-blur">
        {TABS.map((t) => {
          const active = t.end ? pathname === "/" : pathname.startsWith(t.to);
          return (
            <NavLink key={t.to} to={t.to} className="relative flex flex-1 flex-col items-center gap-1 py-1 text-[10px] font-medium">
              <span className={`flex h-7 w-11 items-center justify-center rounded-full transition-colors ${active ? "bg-brand/15 text-brand shadow-[0_0_16px_-6px_rgba(212,175,106,0.6)]" : "text-muted-foreground"}`}>
                <t.icon className="size-[19px]" strokeWidth={1.7} />
                {t.to === "/cart" && count > 0 && (
                  <span className="absolute right-[22%] top-0 flex size-4 items-center justify-center rounded-full bg-brand text-[9px] font-semibold text-[#14110a]">{count}</span>
                )}
              </span>
              <span className={active ? "text-brand" : "text-muted-foreground"}>{t.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
