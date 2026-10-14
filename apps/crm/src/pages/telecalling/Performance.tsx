import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Medal } from "lucide-react";
import { cn } from "@ui";
import { api } from "@/lib/api";
import { CAT, Count, DemoBadge, Empty, GRID, MUTED, SectionHeader, Segmented, aedShort, initials, tooltipStyle } from "@/components/lux";
import TelecallingShell from "@/components/TelecallingShell";
import { SEGMENT_LABEL, type Segment } from "@/lib/telecalling";

type Source = "auto" | "live" | "demo";
interface Perf {
  source: "live" | "demo"; note: string | null; days: number;
  kpis: { calls: number; closed: number; reachRate: number; visits: number; offersRequested: number; offersApproved: number; offersRedeemed: number; converted: number; conversionRate: number; revenue: number };
  agents: { name: string; calls: number; closed: number; reached: number; visits: number; offers: number; converted: number; revenue: number }[];
  segments: { segment: Segment; calls: number; converted: number; revenue: number }[];
  reasons: { reason: string; count: number }[];
}
const SOURCES: { value: Source; label: string }[] = [{ value: "auto", label: "Auto" }, { value: "live", label: "My data" }, { value: "demo", label: "Demo data" }];
const RANGES: { value: "30" | "60" | "90"; label: string }[] = [{ value: "30", label: "30 d" }, { value: "60", label: "60 d" }, { value: "90", label: "90 d" }];

export default function Performance() {
  const [source, setSource] = useState<Source>("auto");
  const [days, setDays] = useState<"30" | "60" | "90">("30");
  const [d, setD] = useState<Perf | null>(null);
  useEffect(() => { setD(null); api.get<Perf>(`/api/crm/telecalling/performance?source=${source}&days=${days}`).then(setD).catch(() => {}); }, [source, days]);

  const funnel = d ? [
    { k: "Calls made", v: d.kpis.calls }, { k: "Conversations closed", v: d.kpis.closed }, { k: "Reached the customer", v: Math.round((d.kpis.closed * d.kpis.reachRate) / 100) },
    { k: "Offers approved", v: d.kpis.offersApproved }, { k: "Customers converted", v: d.kpis.converted },
  ] : [];
  const top = Math.max(1, ...funnel.map((f) => f.v));

  return (
    <TelecallingShell
      title="Telecalling performance"
      subtitle="How much business the team won back from the recurring-customer list — counted from offers redeemed and purchases made within 30 days of a successful call."
      actions={<>{d && <DemoBadge source={d.source} note={d.note ?? undefined} />}<Segmented options={RANGES} value={days} onChange={setDays} /><Segmented options={SOURCES} value={source} onChange={setSource} /></>}
    >
      {d?.note && <p className="-mt-2 mb-3 text-xs text-warning">{d.note}</p>}
      {!d ? <div className="grid gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi k="Business converted" v={<Count value={d.kpis.revenue} format={aedShort} />} sub={`last ${d.days} days`} gold />
            <Kpi k="Customers won back" v={<Count value={d.kpis.converted} />} sub={`${d.kpis.conversionRate}% of closed calls`} />
            <Kpi k="Reach rate" v={<><Count value={d.kpis.reachRate} />%</>} sub={`${d.kpis.calls} calls made`} />
            <Kpi k="Visits booked" v={<Count value={d.kpis.visits} />} sub="from calls" />
            <Kpi k="Offers" v={<Count value={d.kpis.offersRequested} />} sub={`${d.kpis.offersApproved} approved · ${d.kpis.offersRedeemed} redeemed`} />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.2fr]">
            <section className="lux-card p-5">
              <SectionHeader title="From call to sale" />
              <div className="space-y-2.5">
                {funnel.map((f, i) => (
                  <div key={f.k}>
                    <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">{f.k}</span><span className="font-semibold tabular-nums">{f.v.toLocaleString()}{i > 0 && funnel[i - 1].v ? <span className="ml-1.5 font-normal text-muted-foreground">{Math.round((f.v / funnel[i - 1].v) * 100)}%</span> : null}</span></div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full" style={{ width: `${(f.v / top) * 100}%`, background: i === funnel.length - 1 ? CAT[0] : CAT[1] }} /></div>
                  </div>
                ))}
              </div>
            </section>

            <section className="lux-card p-5">
              <SectionHeader title="Business converted by customer type" />
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.segments.map((s) => ({ ...s, label: SEGMENT_LABEL[s.segment] }))} margin={{ top: 8, right: 4, left: -4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 6" vertical={false} stroke={GRID} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v: number) => aedShort(v).replace("AED ", "")} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} width={48} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={(v: number) => [aedShort(v), "Converted"]}
                      labelFormatter={(l: string) => { const s = d.segments.find((x) => SEGMENT_LABEL[x.segment] === l); return s ? `${l} · ${s.converted} of ${s.calls} calls converted` : l; }} />
                    <Bar dataKey="revenue" fill={CAT[0]} radius={[4, 4, 0, 0]} animationDuration={1100} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
            <section className="lux-card p-5">
              <SectionHeader title="Team leaderboard" />
              {d.agents.length === 0 ? <Empty text="No calls logged yet." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead><tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Telecaller</th><th className="py-2 pr-3 text-right font-medium">Calls</th><th className="py-2 pr-3 text-right font-medium">Reached</th>
                      <th className="py-2 pr-3 text-right font-medium">Visits</th><th className="py-2 pr-3 text-right font-medium">Offers</th><th className="py-2 pr-3 text-right font-medium">Converted</th><th className="py-2 text-right font-medium">Business</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {d.agents.map((a, i) => (
                        <tr key={a.name} className="hover:bg-muted/40">
                          <td className="py-2.5 pr-3"><div className="flex items-center gap-2">
                            <span className={cn("flex size-7 items-center justify-center rounded-full text-[10px] font-semibold", i === 0 ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}>{i === 0 ? <Medal className="size-3.5" /> : initials(a.name)}</span>{a.name}</div></td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">{a.calls}</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">{a.closed ? Math.round((a.reached / a.closed) * 100) : 0}%</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">{a.visits}</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">{a.offers}</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">{a.converted}</td>
                          <td className="py-2.5 text-right font-semibold tabular-nums">{aedShort(a.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="lux-card p-5">
              <SectionHeader title="Why customers stopped buying" />
              {d.reasons.length === 0 ? <Empty text="Reasons appear as telecallers log calls." /> : (
                <div className="space-y-2.5">
                  {d.reasons.map((r) => {
                    const max = d.reasons[0].count || 1;
                    return (
                      <div key={r.reason}>
                        <div className="mb-1 flex justify-between text-xs"><span>{r.reason}</span><span className="tabular-nums text-muted-foreground">{r.count}</span></div>
                        <div className="h-2 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: CAT[2] }} /></div>
                      </div>
                    );
                  })}
                  <p className="pt-1 text-xs text-muted-foreground">Tip: if “Travelling / buying in India” leads, a gold-rate lock or a Gold Savings Plan answers it better than a discount.</p>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </TelecallingShell>
  );
}

function Kpi({ k, v, sub, gold }: { k: string; v: React.ReactNode; sub: string; gold?: boolean }) {
  return (
    <div className={cn("lux-card lux-sheen p-4", gold && "border-primary/40")}>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", gold && "text-primary")}>{v}</div>
      <div className="mt-1 text-[11.5px] text-muted-foreground">{sub}</div>
    </div>
  );
}
