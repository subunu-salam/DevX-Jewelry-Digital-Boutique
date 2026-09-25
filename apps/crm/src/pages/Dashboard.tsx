import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarClock, Gem, MessageSquare, TrendingUp, Users } from "lucide-react";
import { api } from "@/lib/api";
import { aed, datetime } from "@/lib/format";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";

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
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  useEffect(() => {
    api.get<DashboardData>("/api/crm/admin/dashboard").then(setData).catch(() => {});
  }, []);

  if (!data) return <div className="text-sm text-muted-foreground">Loading dashboard…</div>;
  const k = data.kpis;

  const kpis = [
    { label: "Revenue (issued)", value: aed(k.revenue), sub: `${aed(k.revenueMonth)} this month`, icon: TrendingUp },
    { label: "Open inquiries", value: k.inquiries, sub: `${k.newInquiries} new`, icon: MessageSquare },
    { label: "Conversion", value: `${k.conversion}%`, sub: "inquiry → sale", icon: TrendingUp },
    { label: "Active products", value: k.products, sub: `${k.totalProducts} total`, icon: Gem },
    { label: "Upcoming visits", value: k.appointments, sub: "appointments", icon: CalendarClock },
    { label: "Customers", value: k.customers, sub: "in CRM", icon: Users },
  ];

  const maxRev = Math.max(...data.branchStats.map((b) => b.revenue), 1);

  return (
    <div>
      <PageHeader title="Executive Dashboard" subtitle="Revenue, pipeline, branches and inventory at a glance." />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
              <kpi.icon className="size-4 text-primary" />
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">{kpi.value}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{kpi.sub}</div>
          </Card>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {/* Revenue trend */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Revenue — last 6 months</h3>
            <span className="text-xs text-muted-foreground">AED</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e9ef" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip formatter={(v: number) => aed(v)} contentStyle={{ borderRadius: 10, border: "1px solid #e6e9ef", fontSize: 13 }} />
                <Bar dataKey="revenue" fill="#b08d57" radius={[6, 6, 0, 0]} maxBarSize={46} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Gold snapshot + low stock */}
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Gold Rate · 22K</span>
              <Link to="/gold" className="text-xs text-primary">Manage →</Link>
            </div>
            <div className="mt-2 text-3xl font-semibold">{k.goldRate22k ? aed(k.goldRate22k) : "—"}<span className="text-sm font-normal text-muted-foreground"> / g</span></div>
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Low stock alerts</h3>
            {data.lowStock.length === 0 ? (
              <p className="text-xs text-muted-foreground">All branches well stocked.</p>
            ) : (
              <div className="space-y-2">
                {data.lowStock.map((l, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="truncate">{l.product}</span>
                    <span className="text-xs text-muted-foreground">{l.branch} · {l.quantity} left</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Branch comparison */}
        <Card className="p-5">
          <h3 className="mb-4 font-semibold">Branch performance</h3>
          <div className="space-y-4">
            {data.branchStats.map((b) => (
              <div key={b.branch}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">{b.branch}</span>
                  <span className="text-muted-foreground">{aed(b.revenue)} · {b.inquiries} leads</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(b.revenue / maxRev) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent inquiries */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Recent inquiries</h3>
            <Link to="/inquiries" className="text-xs text-primary">View pipeline →</Link>
          </div>
          {data.recentInquiries.length === 0 ? (
            <EmptyState message="No inquiries yet." />
          ) : (
            <div className="divide-y divide-border">
              {data.recentInquiries.map((i) => (
                <div key={i.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-sm font-medium">{i.customer}</div>
                    <div className="text-xs text-muted-foreground">{i.reference} · {i.branch ?? "—"} · {datetime(i.createdAt)}</div>
                  </div>
                  <Badge tone={i.status}>{i.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
