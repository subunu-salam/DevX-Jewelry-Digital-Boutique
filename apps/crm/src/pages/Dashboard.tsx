import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, Gem, MessageSquare, Package, Store, Users } from "lucide-react";
import { cn } from "@ui";
import { api } from "@/lib/api";
import { aed, datetime } from "@/lib/format";
import { useAuth } from "@/context/auth";
import { Badge } from "@/components/ui";

interface DashboardData {
  kpis: {
    revenue: number; revenueMonth: number; products: number; totalProducts: number;
    inquiries: number; newInquiries: number; conversion: number; appointments: number;
    customers: number; goldRate22k: number | null;
  };
  branchStats: { branch: string; inquiries: number; revenue: number }[];
  trend: { month: string; revenue: number }[];
  lowStock: { product: string; branch: string; quantity: number }[];
  recentInquiries: { id: string; reference: string; status: string; customer: string; branch: string | null; createdAt: string }[];
  // enhanced (optional so older APIs still render)
  revenueThisMonth?: number;
  revenuePrevMonth?: number;
  pipeline?: { stage: string; count: number }[];
  sources?: { source: string; count: number }[];
  goldTrend?: { date: string; rate: number }[];
  goldChange?: number;
  trendLeads?: { month: string; revenue: number; leads: number }[];
  stockByCategory?: { category: string; products: number; units: number }[];
  upcoming?: { id: string; reference: string; customer: string; branch: string; reason: string; status: string; scheduledAt: string }[];
}

/* Palette: graphite + gold (matches index.css tokens) */
const GOLD = "#d4af6a";
const GOLD_SHADES = ["#d4af6a", "#f0d9a8", "#a8854a", "#e6c88f", "#7d6236", "#c9b48a"];
const INK = "#e9eaee";
const MUTED = "#8b93a3";
const GRID = "#262932";
const tooltipStyle = { background: "#16171c", border: "1px solid #2f323c", borderRadius: 12, fontSize: 12, color: INK, boxShadow: "0 12px 30px -12px rgba(0,0,0,.7)" };

/** Number that counts up once on mount. */
function useCountUp(target: number, ms = 1300) {
  const [v, setV] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(target); return; }
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);
  return v;
}
function Count({ value, format = (n: number) => Math.round(n).toLocaleString("en") }: { value: number; format?: (n: number) => string }) {
  return <>{format(useCountUp(value))}</>;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    api.get<DashboardData>("/api/crm/admin/dashboard").then(setData).catch(() => setError(true));
  }, []);

  if (error) return <div className="lux-card p-8 text-sm text-muted-foreground">The dashboard couldn't load. Check that the API is running, then refresh.</div>;
  if (!data) return <DashboardSkeleton />;

  const k = data.kpis;
  const thisMonth = data.revenueThisMonth ?? k.revenueMonth;
  const prevMonth = data.revenuePrevMonth ?? 0;
  const delta = prevMonth > 0 ? ((thisMonth - prevMonth) / prevMonth) * 100 : null;
  const trend = data.trendLeads ?? data.trend.map((t) => ({ ...t, leads: 0 }));
  const firstName = user?.name?.split(" ")[0] ?? "";
  let d = 0;
  const next = () => ({ ["--d" as string]: `${(d++) * 70}ms` }) as React.CSSProperties;

  return (
    <div className="pb-6">
      {/* ── Greeting ── */}
      <div className="rise mb-6 flex flex-wrap items-end justify-between gap-4" style={next()}>
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-primary/80">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 className="mt-1.5 text-[28px] font-semibold tracking-tight">
            {greeting()}{firstName ? ", " : ""}<span className="gold-text">{firstName}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Here's how Aurelia is performing across your boutiques.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/inquiries" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-sm transition-colors hover:border-primary/50 hover:text-primary"><MessageSquare className="size-4" /> Pipeline</Link>
          <Link to="/catalog" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-[0_0_24px_-8px_rgba(212,175,106,.6)] transition hover:bg-primary/90"><Gem className="size-4" /> Catalog</Link>
        </div>
      </div>

      {/* ── Hero: revenue + KPI tiles ── */}
      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <section className="lux-card lux-sheen rise p-6" style={next()}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Revenue this month</div>
              <div className="mt-1.5 text-[40px] font-semibold leading-none tracking-tight gold-text"><Count value={thisMonth} format={(n) => aed(n)} /></div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                {delta !== null ? (
                  <span className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-medium", delta >= 0 ? "bg-success-bg text-success" : "bg-danger-bg text-danger")}>
                    {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(delta).toFixed(1)}%
                  </span>
                ) : <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">First month of data</span>}
                <span className="text-muted-foreground">vs last month · {aed(k.revenue)} lifetime issued</span>
              </div>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" /> Revenue</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-[#e9eaee]/60" /> Leads</span>
            </div>
          </div>
          <div className="mt-5 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GOLD} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" vertical={false} stroke={GRID} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: MUTED }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="r" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)} />
                <YAxis yAxisId="l" orientation="right" hide />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: GOLD, strokeOpacity: 0.25 }} formatter={(v: number, n: string) => (n === "revenue" ? [aed(v), "Revenue"] : [v, "Leads"])} />
                <Area yAxisId="r" type="monotone" dataKey="revenue" stroke={GOLD} strokeWidth={2.5} fill="url(#revFill)" animationDuration={1400} dot={{ r: 3, fill: GOLD, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                <Line yAxisId="l" type="monotone" dataKey="leads" stroke={INK} strokeOpacity={0.55} strokeWidth={1.6} strokeDasharray="4 4" dot={false} animationDuration={1600} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-4">
          <KpiTile style={next()} icon={MessageSquare} label="Open inquiries" value={k.inquiries} sub={<><span className="pulse-dot mr-1 inline-block size-1.5 rounded-full bg-info align-middle" />{k.newInquiries} new</>} to="/inquiries" />
          <ConversionTile style={next()} value={k.conversion} />
          <KpiTile style={next()} icon={CalendarClock} label="Upcoming visits" value={k.appointments} sub="appointments booked" to="/appointments" />
          <KpiTile style={next()} icon={Users} label="Customers" value={k.customers} sub="in your CRM" to="/customers" />
          <KpiTile style={next()} icon={Gem} label="Active pieces" value={k.products} sub={`${k.totalProducts} in catalogue`} to="/catalog" />
          <GoldTile style={next()} rate={k.goldRate22k} trend={data.goldTrend ?? []} change={data.goldChange ?? 0} />
        </div>
      </div>

      {/* ── Pipeline · Sources · Branches ── */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <section className="lux-card rise p-5" style={next()}>
          <Header title="Inquiry pipeline" link={{ to: "/inquiries", label: "Open" }} />
          <Pipeline stages={data.pipeline ?? []} />
        </section>

        <section className="lux-card rise p-5" style={next()}>
          <Header title="Where leads come from" />
          <Sources sources={data.sources ?? []} />
        </section>

        <section className="lux-card rise p-5" style={next()}>
          <Header title="Branch performance" link={{ to: "/branches", label: "Branches" }} />
          <Branches stats={data.branchStats} />
        </section>
      </div>

      {/* ── Appointments · Recent inquiries · Stock ── */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <section className="lux-card rise p-5" style={next()}>
          <Header title="Coming up" link={{ to: "/appointments", label: "Calendar" }} />
          <Upcoming items={data.upcoming ?? []} />
        </section>

        <section className="lux-card rise p-5" style={next()}>
          <Header title="Recent inquiries" link={{ to: "/inquiries", label: "Pipeline" }} />
          {data.recentInquiries.length === 0 ? (
            <Empty text="No inquiries yet." />
          ) : (
            <ul className="space-y-1">
              {data.recentInquiries.map((i, idx) => (
                <li key={i.id} className="rise group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60" style={{ ["--d" as string]: `${400 + idx * 60}ms` } as React.CSSProperties}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(i.customer)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{i.customer}</div>
                    <div className="truncate text-xs text-muted-foreground">{i.reference} · {i.branch ?? "—"} · {datetime(i.createdAt)}</div>
                  </div>
                  <Badge tone={i.status}>{i.status.toLowerCase()}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lux-card rise p-5" style={next()}>
          <Header title="Inventory health" link={{ to: "/catalog", label: "Catalog" }} />
          <Stock categories={data.stockByCategory ?? []} low={data.lowStock} />
        </section>
      </div>
    </div>
  );
}

/* ───────────────────────── Pieces ───────────────────────── */

function Header({ title, link }: { title: string; link?: { to: string; label: string } }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      {link && (
        <Link to={link.to} className="group inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary">
          {link.label} <ArrowRight className="size-3 transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">{text}</div>;
}

function KpiTile({ icon: Icon, label, value, sub, to, style }: { icon: typeof Users; label: string; value: number; sub: React.ReactNode; to: string; style: React.CSSProperties }) {
  return (
    <Link to={to} className="lux-card lux-sheen rise group block p-4" style={style}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6"><Icon className="size-4" /></span>
      </div>
      <div className="mt-2 text-[28px] font-semibold leading-none tracking-tight"><Count value={value} /></div>
      <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>
    </Link>
  );
}

function ConversionTile({ value, style }: { value: number; style: React.CSSProperties }) {
  const v = useCountUp(value);
  const r = 22, c = 2 * Math.PI * r;
  return (
    <div className="lux-card rise flex items-center gap-3 p-4" style={style}>
      <svg viewBox="0 0 56 56" className="size-14 shrink-0 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke={GRID} strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={GOLD} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(v, 100) / 100)} />
      </svg>
      <div>
        <div className="text-xs text-muted-foreground">Conversion</div>
        <div className="text-[26px] font-semibold leading-none tracking-tight">{Math.round(v)}%</div>
        <div className="mt-1 text-xs text-muted-foreground">inquiry → sale</div>
      </div>
    </div>
  );
}

function GoldTile({ rate, trend, change, style }: { rate: number | null; trend: { date: string; rate: number }[]; change: number; style: React.CSSProperties }) {
  const up = change >= 0;
  return (
    <Link to="/gold" className="lux-card rise group col-span-2 block overflow-hidden p-4 sm:col-span-1" style={style}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Gold · 22K</span>
        {trend.length > 1 && (
          <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium", up ? "bg-success-bg text-success" : "bg-danger-bg text-danger")}>
            {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(change).toFixed(2)}%
          </span>
        )}
      </div>
      <div className="mt-2 text-[24px] font-semibold leading-none tracking-tight">{rate ? <Count value={rate} format={(n) => n.toFixed(2)} /> : "—"}<span className="ml-1 text-xs font-normal text-muted-foreground">AED/g</span></div>
      <div className="-mx-4 -mb-4 mt-2 h-12">
        {trend.length > 1 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="goldSpark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GOLD} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="rate" stroke={GOLD} strokeWidth={1.8} fill="url(#goldSpark)" dot={false} animationDuration={1600} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Link>
  );
}

const STAGE_LABEL: Record<string, string> = { NEW: "New", QUALIFIED: "Qualified", QUOTED: "Quoted", APPOINTMENT: "Appointment", CONVERTED: "Converted", LOST: "Lost" };

function Pipeline({ stages }: { stages: { stage: string; count: number }[] }) {
  const open = stages.filter((s) => s.stage !== "LOST");
  const max = Math.max(1, ...open.map((s) => s.count));
  const lost = stages.find((s) => s.stage === "LOST")?.count ?? 0;
  if (!stages.length) return <Empty text="Pipeline data will appear once inquiries arrive." />;
  return (
    <div className="space-y-3">
      {open.map((s, i) => (
        <div key={s.stage}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-foreground/85">{STAGE_LABEL[s.stage] ?? s.stage}</span>
            <span className="font-semibold tabular-nums">{s.count}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="bar-grow h-full rounded-full"
              style={{
                width: `${Math.max(4, (s.count / max) * 100)}%`,
                background: s.stage === "CONVERTED" ? "linear-gradient(90deg,#4ade80,#86efac)" : `linear-gradient(90deg, ${GOLD_SHADES[4]}, ${GOLD})`,
                opacity: s.count ? 1 : 0.35,
                ["--d" as string]: `${300 + i * 90}ms`,
              } as React.CSSProperties}
            />
          </div>
        </div>
      ))}
      <div className="pt-1 text-xs text-muted-foreground">{lost} lost · keep follow-ups within 24h to lift conversion</div>
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = { boutique: "Online boutique", walk_in: "Walk-in", whatsapp: "WhatsApp", phone: "Phone" };

function Sources({ sources }: { sources: { source: string; count: number }[] }) {
  const total = sources.reduce((s, x) => s + x.count, 0);
  if (!total) return <Empty text="No lead sources yet." />;
  return (
    <div className="flex items-center gap-4">
      <div className="relative size-36 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={sources} dataKey="count" nameKey="source" innerRadius="64%" outerRadius="100%" paddingAngle={3} stroke="none" animationDuration={1300}>
              {sources.map((_, i) => <Cell key={i} fill={GOLD_SHADES[i % GOLD_SHADES.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [v, SOURCE_LABEL[n] ?? n]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold"><Count value={total} /></span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">leads</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2">
        {sources.map((s, i) => (
          <li key={s.source} className="flex items-center gap-2 text-xs">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: GOLD_SHADES[i % GOLD_SHADES.length] }} />
            <span className="flex-1 truncate">{SOURCE_LABEL[s.source] ?? s.source}</span>
            <span className="tabular-nums text-muted-foreground">{Math.round((s.count / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Branches({ stats }: { stats: { branch: string; inquiries: number; revenue: number }[] }) {
  const sorted = [...stats].sort((a, b) => b.revenue - a.revenue || b.inquiries - a.inquiries);
  const max = Math.max(1, ...sorted.map((b) => b.revenue));
  const maxLeads = Math.max(1, ...sorted.map((b) => b.inquiries));
  if (!sorted.length) return <Empty text="No branches yet." />;
  return (
    <ul className="space-y-4">
      {sorted.map((b, i) => (
        <li key={b.branch}>
          <div className="mb-1.5 flex items-center gap-2 text-sm">
            <span className={cn("flex size-5 items-center justify-center rounded-full text-[10px] font-bold", i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{i + 1}</span>
            <Store className="size-3.5 text-muted-foreground" />
            <span className="flex-1 truncate font-medium">{b.branch}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{aed(b.revenue)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="bar-grow h-full rounded-full bg-gradient-to-r from-[#7d6236] to-[#d4af6a]" style={{ width: `${Math.max(3, ((b.revenue || 0) / max) * 100)}%`, ["--d" as string]: `${350 + i * 100}ms` } as React.CSSProperties} />
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted/60">
            <div className="bar-grow h-full rounded-full bg-[#e9eaee]/35" style={{ width: `${(b.inquiries / maxLeads) * 100}%`, ["--d" as string]: `${450 + i * 100}ms` } as React.CSSProperties} />
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{b.inquiries} leads</div>
        </li>
      ))}
    </ul>
  );
}

function Upcoming({ items }: { items: NonNullable<DashboardData["upcoming"]> }) {
  if (!items.length) return <Empty text="No upcoming appointments." />;
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {items.map((a, i) => {
        const when = new Date(a.scheduledAt);
        return (
          <li key={a.id} className="rise relative" style={{ ["--d" as string]: `${350 + i * 80}ms` } as React.CSSProperties}>
            <span className={cn("absolute -left-[26px] top-1 size-2.5 rounded-full ring-4 ring-card", i === 0 ? "bg-primary" : "bg-muted-foreground/50")} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-primary">{when.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · {when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
              <Badge tone={a.status}>{a.status.toLowerCase()}</Badge>
            </div>
            <div className="mt-0.5 text-sm font-medium">{a.customer}</div>
            <div className="text-xs text-muted-foreground">{a.reason} · {a.branch}</div>
          </li>
        );
      })}
    </ol>
  );
}

function Stock({ categories, low }: { categories: { category: string; products: number; units: number }[]; low: { product: string; branch: string; quantity: number }[] }) {
  return (
    <div>
      {categories.length > 0 && (
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categories} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="category" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(212,175,106,.06)" }} formatter={(v: number) => [v, "Units in stock"]} />
              <Bar dataKey="units" radius={[5, 5, 0, 0]} maxBarSize={26} animationDuration={1200}>
                {categories.map((_, i) => <Cell key={i} fill={i % 2 ? GOLD_SHADES[2] : GOLD} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="mt-4 flex items-center gap-2 text-xs font-semibold">
        <Package className="size-3.5 text-warning" /> Low stock
        <span className="ml-auto rounded-full bg-warning-bg px-2 py-0.5 text-[10.5px] text-warning">{low.length}</span>
      </div>
      {low.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">All branches are well stocked.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {low.slice(0, 5).map((l, i) => (
            <li key={i} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate">{l.product}</span>
              <span className="hidden truncate text-muted-foreground sm:inline">{l.branch}</span>
              <span className={cn("w-12 shrink-0 rounded-full px-1.5 py-0.5 text-center font-semibold", l.quantity <= 1 ? "bg-danger-bg text-danger" : "bg-warning-bg text-warning")}>{l.quantity} left</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "G";
}

function DashboardSkeleton() {
  return (
    <div className="pb-6">
      <div className="skeleton mb-6 h-16 w-80 rounded-xl" />
      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <div className="skeleton h-[360px] rounded-2xl" />
        <div className="grid grid-cols-2 gap-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-[106px] rounded-2xl" />)}</div>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-64 rounded-2xl" />)}</div>
    </div>
  );
}

