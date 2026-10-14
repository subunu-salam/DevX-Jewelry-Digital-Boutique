import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Coins, PhoneCall, Search } from "lucide-react";
import { cn } from "@ui";
import { api } from "@/lib/api";
import { aed, date } from "@/lib/format";
import { Count, DemoBadge, Empty, Segmented, aedShort, useToast } from "@/components/lux";
import TelecallingShell from "@/components/TelecallingShell";
import { TIER_STYLE, type Tier } from "@/lib/retention";
import { SEGMENT_HINT, SEGMENT_LABEL, type RecurringLead, type RecurringReport, type Segment } from "@/lib/telecalling";

type Source = "auto" | "live" | "demo";
const SOURCES: { value: Source; label: string }[] = [{ value: "auto", label: "Auto" }, { value: "live", label: "My data" }, { value: "demo", label: "Demo data" }];
type Show = "alerts" | "all" | "down" | "up";
const SHOW: { value: Show; label: string }[] = [{ value: "alerts", label: "Needs a call" }, { value: "down", label: "Buying less" }, { value: "up", label: "Buying more" }, { value: "all", label: "Everyone" }];
const SEG_COLOR: Record<Segment, string> = { ONE_TIME: "#8b93a3", SECOND_TIME: "#60a5fa", RECURRING: "#d4af6a", CONTINUOUS: "#4ade80" };

export default function Recurring() {
  const toast = useToast();
  const [source, setSource] = useState<Source>("auto");
  const [data, setData] = useState<RecurringReport | null>(null);
  const [seg, setSeg] = useState<Segment | "">("");
  const [show, setShow] = useState<Show>("alerts");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = () => api.get<RecurringReport>(`/api/crm/telecalling/recurring?source=${source}`).then(setData).catch(() => setData(null));
  useEffect(() => { setData(null); setSel(new Set()); load(); }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => (data?.leads ?? []).filter((l) =>
    (!seg || l.segment === seg) &&
    (show === "all" || (show === "alerts" ? l.alert : show === "down" ? l.trend === "DOWN" && l.orders >= 2 : l.trend === "UP")) &&
    (!q || `${l.name} ${l.phone ?? ""}`.toLowerCase().includes(q.toLowerCase())),
  ), [data, seg, show, q]);
  const chosen = rows.filter((l) => sel.has(l.id));

  async function queue(list: RecurringLead[]) {
    const items = list.filter((l) => !l.openCall).map((l) => ({
      customerId: l.id, customerName: l.name, customerPhone: l.phone, tier: l.tier, source: "recurring", segment: l.segment, priority: l.priority === "LOW" ? "MEDIUM" : l.priority,
      reason: `${SEGMENT_LABEL[l.segment]} buyer · ${l.alertText}.${l.lastItem ? ` Last bought ${l.lastItem}.` : ""}${l.trendPct != null ? ` Spend ${l.trendPct >= 0 ? "up" : "down"} ${Math.abs(l.trendPct)}% vs previous 3 months.` : ""}`,
      notes: `Suggested opener: ${l.script}`,
    }));
    if (!items.length) { toast("Already in the call queue", "warn"); return; }
    setBusy(true);
    try {
      const r = await api.post<{ created: number; skipped: number }>("/api/crm/retention/calls", { items });
      toast(`${r.created} added to the call queue${r.skipped ? ` · ${r.skipped} already queued` : ""}`);
      setSel(new Set()); load();
    } catch { toast("Couldn't queue the calls", "warn"); } finally { setBusy(false); }
  }

  return (
    <TelecallingShell
      title="Recurring customer leads"
      subtitle="Every buyer, grouped by how often they purchase. When a repeat buyer passes their usual cycle — e.g. a monthly buyer at 30 days — they're flagged here for a call."
      actions={<>{data && <DemoBadge source={data.source} note={data.note ?? undefined} />}<Segmented options={SOURCES} value={source} onChange={setSource} /></>}
    >
      {data?.note && <p className="-mt-2 mb-3 text-xs text-warning">{data.note}</p>}
      {!data ? <div className="grid gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}</div> : (
        <>
          {/* Segments funnel */}
          <div className="grid gap-3 md:grid-cols-4">
            {data.segments.map((s, i) => (
              <button key={s.segment} onClick={() => setSeg((x) => (x === s.segment ? "" : s.segment))}
                className={cn("lux-card rise card-lift relative overflow-hidden p-4 text-left", seg === s.segment && "ring-1 ring-primary")} style={{ ["--d" as string]: `${i * 60}ms` } as React.CSSProperties}>
                <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: SEG_COLOR[s.segment] }} />
                <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{i + 1}. {SEGMENT_LABEL[s.segment]}</span>{i < 3 && <ArrowRight className="size-3.5" />}</div>
                <div className="mt-2 flex items-end gap-2"><span className="text-3xl font-semibold tabular-nums"><Count value={s.count} /></span><span className="pb-1 text-xs text-muted-foreground">clients · {aedShort(s.spend)}</span></div>
                <div className="mt-1 text-xs">{s.alerts ? <span className="text-warning">{s.alerts} overdue for a purchase</span> : <span className="text-success">all on rhythm</span>}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{SEGMENT_HINT[s.segment]}</div>
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Mini k="Repeat customers" v={`${data.kpis.repeatRate}%`} />
            <Mini k="Need a call now" v={String(data.kpis.alerts)} sub={`${data.kpis.highPriority} high priority`} warn />
            <Mini k="Buying less (3 mo)" v={String(data.kpis.trendingDown)} sub={`${data.kpis.trendingUp} buying more`} />
            <Mini k="Gold-plan dues" v={String(data.kpis.planDues)} sub="missed instalments" />
          </div>

          {/* List */}
          <section className="lux-card mt-5 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Segmented options={SHOW} value={show} onChange={(v) => { setShow(v); setSel(new Set()); }} />
              {seg && <button onClick={() => setSeg("")} className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs text-primary">{SEGMENT_LABEL[seg]} ✕</button>}
              <div className="relative ml-auto">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" className="h-9 w-56 rounded-lg border border-input bg-card pl-8 pr-3 text-sm outline-none focus:border-primary" />
              </div>
            </div>
            {rows.length === 0 ? <Empty text="Nobody in this view." /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead><tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="w-8 py-2" /><th className="py-2 pr-3 font-medium">Customer</th><th className="py-2 pr-3 font-medium">Segment</th><th className="py-2 pr-3 font-medium">Buying cycle</th>
                    <th className="py-2 pr-3 font-medium">Status</th><th className="py-2 pr-3 font-medium">Last 3 mo vs previous</th><th className="py-2 text-right font-medium">Action</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {rows.slice(0, 200).map((l) => (
                      <tr key={l.id} className={cn("hover:bg-muted/40", l.alert && l.priority === "HIGH" && "bg-warning/[0.04]")}>
                        <td className="py-2.5"><input type="checkbox" checked={sel.has(l.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n; })} className="size-4 accent-[#d4af6a]" aria-label={`Select ${l.name}`} /></td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-1.5"><span className="font-medium">{l.name}</span><span className={cn("rounded-full border px-1.5 py-px text-[10px] font-semibold", TIER_STYLE[l.tier as Tier]?.chip)}>{l.tier}</span></div>
                          <div className="text-xs text-muted-foreground">{l.phone} · {l.branch}</div>
                        </td>
                        <td className="py-2.5 pr-3"><span className="inline-flex items-center gap-1.5 text-xs"><span className="size-2 rounded-full" style={{ background: SEG_COLOR[l.segment] }} />{SEGMENT_LABEL[l.segment]}</span><div className="text-[11px] text-muted-foreground">{l.orders} purchase{l.orders > 1 ? "s" : ""} · {aedShort(l.lifetimeSpend)}</div></td>
                        <td className="py-2.5 pr-3 text-xs">{l.orders >= 2 ? <>every ~<b>{l.cycleDays}</b> days</> : <span className="text-muted-foreground">—</span>}<div className="text-[11px] text-muted-foreground">last {date(l.lastPurchase)}</div></td>
                        <td className="py-2.5 pr-3">
                          {l.alert
                            ? <span className={cn("inline-flex items-start gap-1 text-xs", l.priority === "HIGH" ? "text-warning" : "text-foreground/80")}><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /><span>{l.alertText}</span></span>
                            : <span className="text-xs text-success">{l.alertText}</span>}
                          {l.openCall && <div className="mt-0.5 text-[10.5px] text-info">in call queue</div>}
                        </td>
                        <td className="py-2.5 pr-3"><Trend l={l} /></td>
                        <td className="py-2.5 text-right">
                          <button disabled={l.openCall || busy} onClick={() => queue([l])} className={cn("!h-8 !px-3 !text-xs disabled:opacity-40", l.alert ? "btn-gold" : "btn-line")}><PhoneCall className="size-3.5" /> {l.openCall ? "Queued" : "Call"}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 200 && <p className="mt-2 text-xs text-muted-foreground">Showing the first 200 of {rows.length}. Narrow with the filters above.</p>}
              </div>
            )}
          </section>

          {data.planDues.length > 0 && (
            <section className="lux-card mt-5 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Coins className="size-4 text-primary" /> Gold-plan instalments overdue</div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {data.planDues.map((d) => (
                  <div key={d.planId} className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-3 text-sm">
                    <div><div className="font-medium">{d.name}</div><div className="text-xs text-muted-foreground">{d.reference} · {d.missed} missed · {aed(d.monthlyAmount)}/mo · {d.paid}/{d.tenure} paid</div></div>
                    <button onClick={() => queue([{ id: d.customerId, name: d.name, phone: d.phone, tier: "Silver", segment: "RECURRING", orders: 0, cycleDays: 30, daysSince: null, overdueBy: 0, lastPurchase: null, lastItem: null, lifetimeSpend: 0, spendLast3m: 0, spendPrev3m: 0, trend: "STEADY", trendPct: null, alert: true, alertText: `Gold plan ${d.reference}: ${d.missed} instalment${d.missed > 1 ? "s" : ""} missed`, priority: "HIGH", openCall: false, script: `Hi ${d.name.split(" ")[0]}, a gentle reminder from Aurelia about your gold savings plan — your instalment is due. Would you like to pay at the boutique or online?` }])} className="btn-line !h-8 !text-xs"><PhoneCall className="size-3.5" /> Call</button>
                  </div>
                ))}
              </div>
              <Link to="/gold-plans" className="mt-2 inline-block text-xs text-primary hover:underline">Open Gold Savings Plans →</Link>
            </section>
          )}
        </>
      )}

      {chosen.length > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-40 mx-auto flex w-fit items-center gap-3 rounded-2xl border border-primary/40 bg-card/95 px-4 py-3 shadow-2xl backdrop-blur toast-in">
          <span className="text-sm"><b>{chosen.length}</b> selected</span>
          <button disabled={busy} onClick={() => queue(chosen)} className="btn-gold"><PhoneCall className="size-4" /> Add to call queue</button>
          <button onClick={() => setSel(new Set())} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}
    </TelecallingShell>
  );
}

function Trend({ l }: { l: RecurringLead }) {
  if (l.trend === "NEW") return <span className="text-xs text-muted-foreground">New customer</span>;
  const max = Math.max(1, l.spendLast3m, l.spendPrev3m);
  const color = l.trend === "UP" ? "#4ade80" : l.trend === "DOWN" ? "#f87171" : "#8b93a3";
  const Icon = l.trend === "UP" ? ArrowUpRight : l.trend === "DOWN" ? ArrowDownRight : ArrowRight;
  return (
    <div className="flex items-center gap-2" title={`Last 3 months ${aed(l.spendLast3m)} · previous 3 months ${aed(l.spendPrev3m)}`}>
      <div className="flex h-7 items-end gap-0.5">
        <span className="w-2.5 rounded-sm bg-muted-foreground/40" style={{ height: `${Math.max(6, (l.spendPrev3m / max) * 100)}%` }} />
        <span className="w-2.5 rounded-sm" style={{ height: `${Math.max(6, (l.spendLast3m / max) * 100)}%`, background: color }} />
      </div>
      <span className="inline-flex items-center gap-0.5 text-xs font-medium" style={{ color }}><Icon className="size-3.5" />{l.trendPct != null ? `${l.trendPct > 0 ? "+" : ""}${l.trendPct}%` : l.trend === "DOWN" ? "no purchase" : "steady"}</span>
    </div>
  );
}

function Mini({ k, v, sub, warn }: { k: string; v: string; sub?: string; warn?: boolean }) {
  return <div className="lux-card p-3"><div className="text-[11px] text-muted-foreground">{k}</div><div className={cn("text-xl font-semibold tabular-nums", warn && "text-warning")}>{v}</div>{sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}</div>;
}
