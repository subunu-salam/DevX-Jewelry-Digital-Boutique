import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Heart, KeyRound, Lightbulb, MessageCircle, Megaphone, PlayCircle } from "lucide-react";
import { cn } from "@ui";
import { api } from "@/lib/api";
import { CAT, Count, DemoBadge, GRID, MUTED, SectionHeader, Segmented, aedShort, tooltipStyle } from "@/components/lux";

type Source = "auto" | "live" | "demo";
interface Campaign { id: string; name: string; status: string; objective: string | null; spend: number; impressions: number; reach: number; clicks: number; ctr: number; cpc: number; leads: number; purchases: number; revenue: number; cpl: number | null; roas: number | null }
interface Report {
  source: "live" | "demo"; note: string | null; configured: boolean; days: number; generatedAt: string;
  kpis: { spend: number; reach: number; impressions: number; clicks: number; ctr: number; cpc: number; leads: number; cpl: number | null; revenue: number; roas: number | null; followers: number | null };
  crm: { leads: number; won: number; revenue: number; costPerCrmLead: number | null };
  campaigns: Campaign[];
  series: { date: string; spend: number; clicks: number; leads: number; reach: number }[];
  posts: { id: string; caption: string; type: string; image: string | null; url: string | null; at: string; likes: number; comments: number; engagement: number }[];
  insights: string[];
}
const SOURCES: { value: Source; label: string }[] = [{ value: "auto", label: "Auto" }, { value: "live", label: "Instagram" }, { value: "demo", label: "Demo data" }];
const RANGES: { value: "7" | "14" | "30" | "90"; label: string }[] = [{ value: "7", label: "7 d" }, { value: "14", label: "14 d" }, { value: "30", label: "30 d" }, { value: "90", label: "90 d" }];
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)));
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default function Marketing() {
  const [source, setSource] = useState<Source>("auto");
  const [days, setDays] = useState<"7" | "14" | "30" | "90">("30");
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null); setError(null);
    api.get<Report>(`/api/crm/retention/marketing?source=${source}&days=${days}`).then(setData).catch((e) => setError((e as Error).message));
  }, [source, days]);

  let d = 0; const next = () => ({ ["--d" as string]: `${(d++) * 60}ms` } as React.CSSProperties);
  const maxSpend = Math.max(1, ...(data?.campaigns.map((c) => c.spend) ?? [1]));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[28px] font-semibold tracking-tight"><Megaphone className="size-6 text-primary" /> Marketing Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Instagram & Meta ad performance pulled straight into the CRM — and what those ads actually turned into.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && <DemoBadge source={data.source} note={data.note ?? undefined} />}
          <Segmented options={RANGES} value={days} onChange={setDays} />
          <Segmented options={SOURCES} value={source} onChange={setSource} />
        </div>
      </div>
      {error && <div className="rounded-xl border border-danger/30 bg-danger-bg p-4 text-sm text-danger">{error}</div>}
      {!data && !error && <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div>}

      {data && (
        <>
          {data.note && <p className="mb-3 text-xs text-warning">{data.note}</p>}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Kpi label="Ad spend" value={<Count value={data.kpis.spend} format={aedShort} />} sub={`last ${data.days} days`} style={next()} />
            <Kpi label="Reach" value={<Count value={data.kpis.reach} format={compact} />} sub={`${compact(data.kpis.impressions)} impressions`} style={next()} />
            <Kpi label="Clicks · CTR" value={<><Count value={data.kpis.clicks} format={compact} /><span className="ml-1.5 text-sm text-muted-foreground">{data.kpis.ctr}%</span></>} sub={`AED ${data.kpis.cpc} per click`} style={next()} />
            <Kpi label="Leads from ads" value={<Count value={data.kpis.leads} />} sub={data.kpis.cpl ? `AED ${data.kpis.cpl} per lead` : "—"} style={next()} />
            <Kpi label="Attributed sales" value={<Count value={data.kpis.revenue} format={aedShort} />} sub={data.kpis.roas ? `${data.kpis.roas}× return on ad spend` : "—"} style={next()} />
            <Kpi label="Followers" value={data.kpis.followers != null ? <Count value={data.kpis.followers} format={compact} /> : "—"} sub="Instagram" style={next()} />
          </div>

          {/* CRM attribution strip */}
          <section className="lux-card rise mt-5 grid gap-4 p-5 md:grid-cols-[1.3fr_repeat(4,1fr)]" style={next()}>
            <div><div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">In the CRM</div><p className="mt-1 text-sm text-muted-foreground">Leads tagged <b className="text-foreground">Instagram</b> in Leads / Inquiries for the same period.</p></div>
            <Mini k="Instagram leads in CRM" v={String(data.crm.leads)} />
            <Mini k="Converted to sale" v={String(data.crm.won)} />
            <Mini k="Revenue from them" v={aedShort(data.crm.revenue)} />
            <Mini k="Real cost per CRM lead" v={data.crm.costPerCrmLead ? `AED ${data.crm.costPerCrmLead}` : "—"} />
          </section>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
            <section className="lux-card rise p-5" style={next()}>
              <SectionHeader title="Daily spend" right={<span className="text-xs text-muted-foreground">AED</span>} />
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.series} margin={{ top: 4, right: 4, left: -10, bottom: 0 }} barCategoryGap="22%">
                    <CartesianGrid strokeDasharray="3 6" vertical={false} stroke={GRID} />
                    <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} labelFormatter={dayLabel} formatter={(v: number) => [`AED ${Math.round(v).toLocaleString()}`, "Spend"]} />
                    <Bar dataKey="spend" fill={CAT[1]} radius={[4, 4, 0, 0]} animationDuration={1100} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 mb-1 text-sm font-medium">Leads per day</div>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.series} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 6" vertical={false} stroke={GRID} />
                    <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: CAT[0], strokeOpacity: 0.3 }} labelFormatter={dayLabel} formatter={(v: number) => [v, "Leads"]} />
                    <Line type="monotone" dataKey="leads" stroke={CAT[0]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} animationDuration={1300} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="lux-card rise p-5" style={next()}>
              <SectionHeader title="AI read-out" />
              {data.insights.length ? (
                <ul className="space-y-2.5">{data.insights.map((s) => (
                  <li key={s} className="flex gap-2.5 rounded-xl border border-border bg-muted/30 p-3 text-[13px] leading-5"><Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />{s}</li>
                ))}</ul>
              ) : <p className="text-sm text-muted-foreground">Not enough activity to call out patterns yet.</p>}
              {!data.configured && (
                <div className="mt-4 rounded-xl border border-primary/30 bg-primary/[0.05] p-4 text-[12.5px] leading-5">
                  <div className="mb-1.5 flex items-center gap-2 font-medium"><KeyRound className="size-4 text-primary" /> Connect Instagram (one-time)</div>
                  <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                    <li>In Meta Business Manager, create a System User with <b className="text-foreground">ads_read</b>, <b className="text-foreground">instagram_basic</b> and <b className="text-foreground">instagram_manage_insights</b>.</li>
                    <li>In Render → API service → Environment add <code className="text-foreground">META_ACCESS_TOKEN</code>, <code className="text-foreground">META_AD_ACCOUNT_ID</code> and (for posts) <code className="text-foreground">META_IG_USER_ID</code>.</li>
                    <li>Redeploy — this page switches from sample to live automatically.</li>
                  </ol>
                </div>
              )}
            </section>
          </div>

          {/* Campaigns */}
          <section className="lux-card rise mt-5 p-5" style={next()}>
            <SectionHeader title="Campaigns" right={<span className="text-xs text-muted-foreground">sorted by spend</span>} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Campaign</th><th className="py-2 pr-3 font-medium">Spend</th><th className="py-2 pr-3 text-right font-medium">Reach</th>
                  <th className="py-2 pr-3 text-right font-medium">CTR</th><th className="py-2 pr-3 text-right font-medium">Leads</th><th className="py-2 pr-3 text-right font-medium">Cost / lead</th><th className="py-2 text-right font-medium">Return</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {data.campaigns.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/40">
                      <td className="py-2.5 pr-3"><div className="font-medium">{c.name}</div><div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold", c.status === "ACTIVE" ? "bg-success-bg text-success" : "bg-muted text-muted-foreground")}>{c.status.toLowerCase()}</span>{c.objective?.replace("OUTCOME_", "").toLowerCase()}</div></td>
                      <td className="py-2.5 pr-3"><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full" style={{ width: `${(c.spend / maxSpend) * 100}%`, background: CAT[1] }} /></div><span className="tabular-nums">{aedShort(c.spend)}</span></div></td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{compact(c.reach)}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{c.ctr.toFixed(2)}%</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{c.leads}</td>
                      <td className={cn("py-2.5 pr-3 text-right tabular-nums", c.cpl && data.kpis.cpl && c.cpl > data.kpis.cpl * 1.6 && "text-warning")}>{c.cpl ? `AED ${Math.round(c.cpl)}` : "—"}</td>
                      <td className="py-2.5 text-right tabular-nums">{c.roas ? `${c.roas.toFixed(1)}×` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Posts */}
          {data.posts.length > 0 && (
            <section className="lux-card rise mt-5 p-5" style={next()}>
              <SectionHeader title="Top Instagram posts · by engagement" right={<BarChart3 className="size-4 text-muted-foreground" />} />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {data.posts.slice(0, 5).map((p, i) => (
                  <a key={p.id} href={p.url ?? undefined} target="_blank" rel="noopener noreferrer" className="card-lift group overflow-hidden rounded-xl border border-border bg-muted/30">
                    <div className="relative aspect-square" style={{ background: p.image ? undefined : `radial-gradient(circle at ${30 + i * 12}% 30%, #f3c9b0, #b7810f 55%, #1f1c18)` }}>
                      {p.image && <img src={p.image} alt="" className="size-full object-cover" loading="lazy" />}
                      {p.type === "VIDEO" && <PlayCircle className="absolute right-2 top-2 size-5 text-white drop-shadow" />}
                      <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">#{i + 1}</span>
                    </div>
                    <div className="p-2.5">
                      <p className="line-clamp-2 text-[12px] leading-4">{p.caption || "—"}</p>
                      <div className="mt-1.5 flex gap-3 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1"><Heart className="size-3" />{compact(p.likes)}</span><span className="inline-flex items-center gap-1"><MessageCircle className="size-3" />{compact(p.comments)}</span></div>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, style }: { label: string; value: React.ReactNode; sub: string; style: React.CSSProperties }) {
  return (
    <div className="lux-card lux-sheen rise p-4" style={style}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[11.5px] text-muted-foreground">{sub}</div>
    </div>
  );
}
const Mini = ({ k, v }: { k: string; v: string }) => <div><div className="text-[11px] text-muted-foreground">{k}</div><div className="mt-0.5 text-xl font-semibold tabular-nums">{v}</div></div>;
