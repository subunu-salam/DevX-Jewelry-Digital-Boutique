import { Link, NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { useStore } from "@/context/store";

const nav = [
  { to: "/catalog", label: "Collections" },
  { to: "/catalog?filter=new", label: "New Arrivals" },
  { to: "/gold-rate", label: "Gold Rate" },
  { to: "/offers", label: "Offers" },
  { to: "/appointments", label: "Book a Visit" },
];

export default function Header() {
  const { cart, customer } = useStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const count = cart.reduce((s, l) => s + l.quantity, 0);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) navigate(`/catalog?search=${encodeURIComponent(q.trim())}`);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-10">
        <button className="lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        <Link to="/" className="mr-2 flex items-center gap-2">
          <span className="font-serif text-2xl font-semibold tracking-tight">Aurelia</span>
          <span className="hidden text-[10px] uppercase tracking-[0.3em] text-brand-deep sm:inline">Fine Jewellery</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-7 lg:flex">
          {nav.map((n) => (
            <NavLink
              key={n.label}
              to={n.to}
              className={({ isActive }) =>
                `text-sm transition-colors hover:text-brand ${isActive ? "text-brand" : "text-foreground/70"}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <form onSubmit={submitSearch} className="ml-auto hidden items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 md:flex">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the collection…"
            className="w-36 bg-transparent text-sm outline-none placeholder:text-muted-foreground lg:w-48"
          />
        </form>

        <div className="ml-auto flex items-center gap-1 md:ml-2">
          <Link to="/account" className="rounded-full p-2 hover:bg-muted" aria-label="Account">
            <User className="size-5" />
          </Link>
          <Link to="/cart" className="relative rounded-full p-2 hover:bg-muted" aria-label="Inquiry bag">
            <ShoppingBag className="size-5" />
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-medium text-white">
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>

      {open && (
        <nav className="border-t border-border bg-background px-4 py-3 lg:hidden">
          {nav.map((n) => (
            <NavLink
              key={n.label}
              to={n.to}
              onClick={() => setOpen(false)}
              className="block py-2 text-sm text-foreground/80"
            >
              {n.label}
            </NavLink>
          ))}
          <div className="pt-1 text-xs text-muted-foreground">
            {customer ? `Signed in as ${customer.name}` : "Guest"}
          </div>
        </nav>
      )}
    </header>
  );
}
