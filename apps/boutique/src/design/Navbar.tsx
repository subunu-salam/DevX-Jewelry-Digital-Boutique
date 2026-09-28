import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { Home, LayoutGrid, ShoppingBag, Sparkles, TrendingUp, User } from "lucide-react";
import { cn } from "@ui";
import { useStore } from "@/context/store";
import { Brand } from "./Brand";
import { IconButton } from "./Button";
import { SearchBar } from "./SearchBar";
import { ThemeToggle } from "./Theme";

/** Primary navigation — identical destinations & labels to the live boutique. */
export const NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/catalog", label: "Shop", icon: LayoutGrid, end: false },
  { to: "/ai", label: "Studio", icon: Sparkles, end: false },
  { to: "/gold-rate", label: "Gold", icon: TrendingUp, end: false },
  { to: "/cart", label: "Bag", icon: ShoppingBag, end: false },
] as const;

const isActive = (pathname: string, to: string, end: boolean) => (end ? pathname === to : pathname.startsWith(to));

function useBagCount() {
  const { cart } = useStore();
  return cart.reduce((s, l) => s + l.quantity, 0);
}

function BagCount({ className }: { className?: string }) {
  const count = useBagCount();
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.span
          key={count}
          initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.3, opacity: 0 }}
          transition={{ type: "spring", stiffness: 600, damping: 20 }}
          className={cn("absolute flex size-[17px] items-center justify-center rounded-full bg-brand text-[9.5px] font-bold text-[#FFFDF8]", className)}
        >
          {count}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/** Top app bar: brand · theme · search · account. */
export function Navbar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(y > 8);
    setHidden(y > 160 && y > prev + 2);
    if (y < prev - 2) setHidden(false);
  });
  useEffect(() => { setHidden(false); }, [pathname]);

  return (
    <>
      <motion.header
        animate={{ y: hidden ? "-110%" : "0%" }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "sticky top-0 z-50 pt-[env(safe-area-inset-top)] transition-[background-color,border-color] duration-500",
          scrolled ? "border-b border-border bg-[var(--color-glass)] backdrop-blur-xl" : "border-b border-transparent bg-background",
        )}
      >
        <div className="mx-auto flex h-[64px] max-w-[1320px] items-center gap-3 px-4 md:h-[74px] md:px-8">
          <Brand compact />
          <SearchBar size="sm" placeholder="Search jewellery…" className="ml-auto min-w-0 max-w-[230px] flex-1" />
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <IconButton label="Account" active={pathname.startsWith("/account")} onClick={() => navigate("/account")}><User className="size-[17px]" strokeWidth={1.7} /></IconButton>
          </div>
        </div>
      </motion.header>

    </>
  );
}

/**
 * Bottom tab bar — Home · Shop · Studio · Gold · Bag.
 * Floating charcoal pill; a gold "bump" glides to the active tab and lifts its icon.
 */
export function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[var(--app-w)] px-3 pb-[calc(10px+env(safe-area-inset-bottom))]">
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex h-[64px] items-stretch rounded-[26px] border border-on-night/10 bg-night px-1 shadow-[0_18px_40px_-16px_rgba(0,0,0,.55)]"
      >
        {NAV.map((n) => {
          const active = isActive(pathname, n.to, n.end);
          return (
            <NavLink
              key={n.to}
              to={n.to}
              aria-current={active ? "page" : undefined}
              className="relative flex flex-1 flex-col items-center justify-end gap-1 pb-2.5 text-[10.5px] font-semibold"
            >
              {/* the raised gold bump — its night-coloured ring cuts a notch into the bar */}
              {active && (
                <motion.span
                  layoutId="tab-bump"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className="absolute inset-x-0 -top-[18px] mx-auto size-[46px] rounded-full bg-brand ring-[5px] ring-night shadow-[0_8px_22px_-6px_rgba(168,135,78,.75)]"
                />
              )}
              <motion.span
                animate={{ y: active ? -17 : 0, scale: active ? 1.05 : 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
                className={cn("relative z-10 transition-colors duration-300", active ? "text-[#FFFDF8]" : "text-on-night/55")}
              >
                <n.icon className="size-[21px]" strokeWidth={active ? 2 : 1.6} />
                {n.to === "/cart" && <BagCount className="-right-2.5 -top-1.5 ring-2 ring-night" />}
              </motion.span>
              <span className={cn("relative z-10 transition-colors duration-300", active ? "text-brand-soft" : "text-on-night/55")}>{n.label}</span>
              {active && <motion.span layoutId="tab-dot" className="absolute bottom-1 size-1 rounded-full bg-brand" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
            </NavLink>
          );
        })}
      </motion.div>
    </nav>
  );
}
