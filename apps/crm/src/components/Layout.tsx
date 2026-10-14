import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Gem, MessageSquare, CalendarClock, Users, FileText, Receipt,
  Truck, Tag, TrendingUp, Building2, UsersRound, LogOut, Menu, ChevronDown, Sparkles, HeartHandshake, PhoneCall, Megaphone,
  Repeat, BadgeCheck, Trophy, Coins, type LucideIcon,
} from "lucide-react";
import { useAuth, roleLabel } from "@/context/auth";
import { api } from "@/lib/api";
import { cn } from "@ui";

export const MANAGER_ROLES = ["PLATFORM_ADMIN", "OWNER", "COMPANY_ADMIN", "BRANCH_MANAGER"];
type Item = { to: string; label: string; icon: LucideIcon; end?: boolean; managers?: boolean; badge?: "approvals" };
const NAV: { group: string; items: Item[] }[] = [
  { group: "Overview", items: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/insights", label: "AI Insights", icon: Sparkles },
  ] },
  { group: "Sales", items: [
    { to: "/inquiries", label: "Leads / Inquiries", icon: MessageSquare },
    { to: "/appointments", label: "Appointments", icon: CalendarClock },
    { to: "/quotes", label: "Quotations", icon: FileText },
    { to: "/invoices", label: "Invoices", icon: Receipt },
  ] },
  { group: "Customers & Loyalty", items: [
    { to: "/customers", label: "Customers", icon: Users },
    { to: "/retention", label: "Loyalty & Retention", icon: HeartHandshake },
    { to: "/gold-plans", label: "Gold Savings Plans", icon: Coins },
  ] },
  { group: "Telecalling", items: [
    { to: "/telecalling/recurring", label: "Recurring customers", icon: Repeat },
    { to: "/telecalling/calls", label: "Call queue", icon: PhoneCall },
    { to: "/telecalling/approvals", label: "Offer approvals", icon: BadgeCheck, badge: "approvals" },
    { to: "/telecalling/performance", label: "Performance", icon: Trophy },
  ] },
  { group: "Marketing", items: [
    { to: "/offers", label: "Campaigns & Offers", icon: Tag },
    { to: "/marketing", label: "Marketing Analytics", icon: Megaphone },
  ] },
  { group: "Inventory & Admin", items: [
    { to: "/catalog", label: "Catalog & Inventory", icon: Gem },
    { to: "/gold", label: "Gold Rate", icon: TrendingUp },
    { to: "/suppliers", label: "Suppliers", icon: Truck, managers: true },
    { to: "/branches", label: "Branches", icon: Building2, managers: true },
    { to: "/team", label: "Team & Settings", icon: UsersRound, managers: true },
  ] },
];

function useCollapsed() {
  const [c, setC] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem("nav-collapsed") ?? "{}"); } catch { return {}; } });
  const toggle = (g: string) => setC((p) => { const n = { ...p, [g]: !p[g] }; try { localStorage.setItem("nav-collapsed", JSON.stringify(n)); } catch { /* ignore */ } return n; });
  return [c, toggle] as const;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [collapsed, toggleGroup] = useCollapsed();
  const isManager = MANAGER_ROLES.includes(user?.role ?? "");
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const load = () => api.get<{ pending: number }>("/api/crm/telecalling/approvals/count").then((r) => setPending(r.pending)).catch(() => {});
    load(); const t = setInterval(load, 60_000); return () => clearInterval(t);
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:flex lg:translate-x-0",
          open ? "flex translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-2 px-5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground gold-glow"><Gem className="size-4" /></div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white">Boutique OS</div>
            <div className="text-[10px] uppercase tracking-wider text-white/40">by DevX</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {NAV.map((g) => {
            const items = g.items.filter((n) => !n.managers || isManager);
            if (!items.length) return null;
            const shut = collapsed[g.group];
            return (
              <div key={g.group} className="pb-1">
                <button onClick={() => toggleGroup(g.group)} className="flex w-full items-center justify-between px-3 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/35 hover:text-white/60">
                  {g.group}<ChevronDown className={cn("size-3 transition-transform", shut && "-rotate-90")} />
                </button>
                {!shut && items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        isActive ? "bg-primary/15 text-primary" : "text-white/55 hover:bg-white/5 hover:text-white",
                      )
                    }
                  >
                    <n.icon className="size-4" />
                    <span className="flex-1">{n.label}</span>
                    {n.badge === "approvals" && pending > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{pending}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <button onClick={() => { logout(); navigate("/login"); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-card/80 px-5 backdrop-blur">
          <button className="lg:hidden" onClick={() => setOpen(true)}><Menu className="size-5" /></button>
          <div className="text-sm text-muted-foreground">{user?.tenantName}</div>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium">{user?.name}</div>
              <div className="text-xs text-muted-foreground">
                {user && roleLabel(user.role)}{user?.branchName ? ` · ${user.branchName}` : ""}
              </div>
            </div>
            <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {user?.name?.charAt(0)}
            </div>
            <ChevronDown className="size-4 text-muted-foreground" />
          </div>
        </header>
        <main className="flex-1 px-5 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
