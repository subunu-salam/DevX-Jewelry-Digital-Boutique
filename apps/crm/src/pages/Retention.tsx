import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BellRing, Crown, HeartHandshake, MessageCircle, PhoneCall, Send, Sparkles } from "lucide-react";
import { cn } from "@ui";
import { api } from "@/lib/api";
import { aed, date } from "@/lib/format";
import { Count, DemoBadge, Drawer, Empty, MUTED, Ring, SectionHeader, Segmented, aedShort, initials, tooltipStyle, useToast } from "@/components/lux";
import { RISK_STYLE, TIER_STYLE, waLink, type Client, type RetentionReport, type Tier } from "@/lib/retention";

type Source = "auto" | "live" | "demo";
type View = "all" | "CALL" | "CAMPAIGN";
const SOURCES: { value: Source; label: string }[] = [{ value: "auto", label: "Auto" }, { value: "live", label: "My data" }, { value: "demo", label: "Demo data" }];
const VIEWS: { value: View; label: string }[] = [{ value: "all", label: "All alerts" }, { value: "CALL", label: "Telecall" }, { value: "CAMPAIGN", label: "Campaign" }];

export default function Retention() {
  const toast = useToast();
  const [source, setSource] = useState<Source>("auto");
  const [data, setData] = useState<RetentionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("all");
  const [tier, setTier] = useState<Tier | "">("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Client | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    try { setData(await api.get<RetentionReport>(`/api/crm/retention?source=${source}`)); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { setData(null); setSel(new Set()); load(); }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => (data?.alerts ?? []).filter((c) =>
    (view === "all" || (view === "CALL" ? c.action === "CALL" : c.action === "WINBACK_CAMPAIGN" || c.action === "REMINDER_CAMPAIGN")) && (!tier || c.tier === tier),
  ), [data, view, tier]);
  const chosen = rows.filter((c) => sel.has(c.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function queueCalls(list: Client[]) {
    const items = list.filter((c) => !c.openCall).map((c) => ({
      customerId: c.id, customerName: c.name, customerPhone: c.phone, tier: c.tier, source: "churn",
      priority: c.tier === "Noir" || c.tier === "Platinum" || c.risk === "Lapsed" ? "HIGH" : "MEDIUM",
      reason: `${c.risk}: ${c.why[0] ?? "buying less often"}. ${c.lastItem ? `Last bought ${c.lastItem}.` : ""}`.trim(),
      notes: `Suggested opener: ${c.script}`,
    }));
    if (!items.length) { toast("Already in the telecalling queue", "warn"); return; }
    setBusy(true);
    try {
      const r = await api.post<{ created: number; skipped: number }>("/api/crm/retention/calls", { items });
      toast(`${r.created} call${r.created === 1 ? "" : "s"} added to the telecalling queue${r.skipped ? ` (${r.skipped} already queued)` : ""}`);
      setSel(new Set()); load();
    } catch { toast("Couldn't queue the calls", "warn"); } finally { setBusy(false); }
  }
  async function sendCampaign(list: Client[]) {
    const targets = list.filter((c) => c.action !== "CALL");
    if (!targets.length) { toast("Pick clients marked for a campaign", "warn"); return; }
    setBusy(true);
    try {
      await api.post("/api/crm/retention/campaign", { kind: targets[0].action === "REMINDER_CAMPAIGN" ? "REMINDER_CAMPAIGN" : "WINBACK_CAMPAIGN", channel: "whatsapp", clients: targets.map((c) => ({ id: c.id, name: c.name })) });
      toast(`Win-back campaign queued for ${targets.length} client${targets.length === 1 ? "" : "s"}`);
      setSel(new Set());
    } catch { toast("Couldn't queue the campaign", "warn"); } finally { setBusy(false); }
  }

  let d = 0; const next = () => ({ ["--d" as string]: `${(d++) * 60}ms` } as React.CSSProperties);

  return (
    <div className="pb-24">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[28px] font-semibold tracking-tight"><HeartHandshake className="size-6 text-primary" /> Loyalty & Retention</h1>
          <p className="mt-1 text-sm text-muted-foreground">AI watches each client's buying rhythm and flags anyone drifting away — then routes them to a call or a campaign.</p>
        </div>
        <div className="flex items-center gap-2">
          {data && <DemoBadge source={data.source} note={data.note ?? undefined} />}
          <Segmented options={SOURCES} value={source} onChange={setSource} />
        </div>
      </div>
      {error && <div className="rounded-xl border border-danger/30 bg-danger-bg p-4 text-sm text-danger">{error}</div>}
      {!data && !error && <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div>}

      {data && (
        <>
          {data.note && <p className="mb-3 text-xs text-warning">{data.note}</p>}
          <section className="lux-card rise mb-5 flex items-start gap-4 p-5" style={next()}>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10"><BellRing className="size-5 text-primary" /></div>
            <div><div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Churn alert</div><p className="mt-1 text-lg leading-snug">{data.headline}</p></div>
          </section>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Clients with purchases" value={<Count value={data.kpis.clients} />} sub={`${data.kpis.repeatRate}% have bought more than once`} style={next()} />
            <Kpi label="Churn alerts" value={<Count value={data.kpis.alerts} />} sub="buying less often than usual" style={next()} tone="warn" />
            <Kpi label="Value at stake" value={<Count value={data.kpis.atRiskValue} format={aedShort} />} sub="one typical order each" style={next()} />
            <Kpi label="Calls suggested" value={<Count value={data.kpis.callsSuggested} />} sub="Gold tier and above" style={next()} />
            <Kpi label="Campaigns suggested" value={<Count value={data.kpis.campaignsSuggested} />} sub="automated win-back" style={next()} />
          </div>

          {/* Tiers */}
          <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {data.tiers.map((t) => (
              <button key={t.tier} onClick={() => setTier((x) => (x === t.tier ? "" : t.tier))}
                className={cn("lux-card rise card-lift p-4 text-left", tier === t.tier && "ring-1 ring-primary")} style={next()}>
                <div className="flex items-center justify-between">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", TIER_STYLE[t.tier].chip)}><Crown className="size-3.5" /> {t.tier}</span>
                  <span className="text-[11px] text-muted-foreground">{t.min ? `from ${aedShort(t.min)}` : "first purchase"}</span>
                </div>
                <div className="mt-3 flex items-end gap-2"><span className="text-3xl font-semibold tabular-nums">{t.count}</span><span className="pb-1 text-xs text-muted-foreground">clients · {aedShort(t.spend)} lifetime</span></div>
                <div className="mt-1 text-xs">{t.atRisk ? <span className="text-warning">{t.atRisk} drifting away</span> : <span className="text-success">all on rhythm</span>}</div>
                <p className="mt-2 text-[11.5px] leading-5 text-muted-foreground">{t.perks}</p>
              </button>
            ))}
          </section>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_2.2fr]">
            {/* Risk mix */}
            <section className="lux-card rise p-5" style={next()}>
              <SectionHeader title="Where clients are in their rhythm" />
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.riskMix} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                    <XAxis dataKey="risk" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={(v: number) => [v, "Clients"]} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} animationDuration={1100}>
                      {data.riskMix.map((r) => <Cell key={r.risk} fill={RISK_STYLE[r.risk].color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground"><b className="text-foreground">How it works:</b> each client's usual gap between purchases (≈{data.kpis.avgGap} days on average) is compared with the time since their last one. Overdue by 25%+ → at risk; more than double → lapsed.</p>
            </section>

            {/* Alerts */}
            <section className="lux-card rise p-5" style={next()}>
              <SectionHeader title="AI churn alerts" right={<Segmented options={VIEWS} value={view} onChange={(v) => { setView(v); setSel(new Set()); }} />} />
              {rows.length === 0 ? <Empty text="No clients drifting in this view." /> : (
                <div className="-mx-2 max-h-[560px] overflow-y-auto">
                  {rows.map((c) => {
                    const ratio = c.daysSince != null ? Math.min(3, c.daysSince / c.avgGapDays) : 0;
                    return (
                      <div key={c.id} className={cn("group flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-muted/50", sel.has(c.id) && "bg-primary/[0.06]")}>
                        <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="size-4 accent-[#d4af6a]" aria-label={`Select ${c.name}`} />
                        <Ring value={c.churnScore} size={40} stroke={3.5} color={RISK_STYLE[c.risk].color} />
                        <button onClick={() => setOpen(c)} className="min-w-0 flex-1 text-left">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-medium">{c.name}</span>
                            <span className={cn("rounded-full border px-1.5 py-px text-[10px] font-semibold", TIER_STYLE[c.tier].chip)}>{c.tier}</span>
                            <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold", RISK_STYLE[c.risk].chip)}>{c.risk}</span>
                            {c.openCall && <span className="rounded-full bg-info-bg px-1.5 py-px text-[10px] text-info">in call queue</span>}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="relative h-1.5 w-28 overflow-hidden rounded-full bg-border" title="Time since last purchase vs their usual gap">
                              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(ratio / 3) * 100}%`, background: RISK_STYLE[c.risk].color }} />
                              <div className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: "33.3%" }} />
                            </div>
                            <span className="truncate text-[11.5px] text-muted-foreground">{c.daysSince}d since last · usually {c.avgGapDays}d · {c.orders} orders · {aedShort(c.lifetimeSpend)}</span>
                          </div>
                        </button>
                        <div className="hidden shrink-0 text-right sm:block">
                          <div className={cn("text-xs font-medium", c.action === "CALL" ? "text-primary" : "text-foreground/80")}>{c.actionLabel}</div>
                          <div className="text-[10.5px] text-muted-foreground">{c.branch}</div>
                        </div>
                        {c.action === "CALL"
                          ? <button disabled={c.openCall || busy} onClick={() => queueCalls([c])} className="btn-line shrink-0 !h-8 !px-2.5 !text-xs disabled:opacity-40"><PhoneCall className="size-3.5" /> Queue</button>
                          : <a href={waLink(c.phone, c.script)} target="_blank" rel="noopener noreferrer" className="btn-line shrink-0 !h-8 !px-2.5 !text-xs hover:!border-success/50 hover:!text-success"><MessageCircle className="size-3.5" /> Send</a>}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Points: 1 per AED 10 spent, multiplied by tier (Gold 1.5×, Platinum 2×, Noir 3×). Tiers use lifetime spend. Alerts are guidance for your team — clients without marketing consent should only be contacted about their own orders.</p>
        </>
      )}

      {/* Bulk action bar */}
      {chosen.length > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-40 mx-auto flex w-fit items-center gap-3 rounded-2xl border border-primary/40 bg-card/95 px-4 py-3 shadow-2xl backdrop-blur toast-in">
          <span className="text-sm"><b>{chosen.length}</b> selected</span>
          <button disabled={busy} onClick={() => queueCalls(chosen)} className="btn-gold"><PhoneCall className="size-4" /> Queue calls</button>
          <button disabled={busy} onClick={() => sendCampaign(chosen)} className="btn-line"><Send className="size-4" /> Send win-back</button>
          <button onClick={() => setSel(new Set())} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ""} subtitle={open ? `${open.tier} · ${open.points.toLocaleString()} points${open.nextTier ? ` · ${aed(open.toNextTier)} to ${open.nextTier}` : ""}` : ""}
        footer={open && (
          <div className="flex gap-2">
            <button disabled={open.openCall || busy} onClick={() => { queueCalls([open]); setOpen(null); }} className="btn-gold flex-1 disabled:opacity-40"><PhoneCall className="size-4" /> {open.openCall ? "Already queued" : "Add to call queue"}</button>
            {open.phone && <a href={waLink(open.phone, open.script)} target="_blank" rel="noopener noreferrer" className="btn-line flex-1"><MessageCircle className="size-4" /> WhatsApp</a>}
          </div>
        )}>
        {open && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{initials(open.name)}</div>
              <div><div className="text-muted-foreground">{open.phone ?? "No phone"}</div><div className="text-xs text-muted-foreground">{open.branch} · {open.consent ? "Marketing consent ✓" : "No marketing consent"}</div></div>
              <div className="ml-auto"><Ring value={open.churnScore} size={52} stroke={4} color={RISK_STYLE[open.risk].color} /></div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[["Lifetime", aedShort(open.lifetimeSpend)], ["Last 12 m", aedShort(open.spend12m)], ["Orders", String(open.orders)], ["Avg order", aedShort(open.aov)], ["Usual gap", `${open.avgGapDays} d`], ["Since last", `${open.daysSince ?? "—"} d`]].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-muted/50 p-2"><div className="text-[10.5px] text-muted-foreground">{k}</div><div className="font-semibold">{v}</div></div>
              ))}
            </div>
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Why the AI flagged this</div>
              <ul className="space-y-1">{open.why.map((w) => <li key={w} className="flex gap-2"><Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />{w}</li>)}</ul>
            </div>
            <div className="text-xs text-muted-foreground">Last purchase: {open.lastItem ?? "—"} on {date(open.lastPurchase)}. Expected back around {date(open.expectedNext)}.</div>
            <div className="rounded-xl border border-primary/30 bg-primary/[0.06] p-3">
              <div className="mb-1 text-xs font-semibold text-primary">{open.actionLabel} · suggested message</div>
              <p className="leading-6">{open.script}</p>
            </div>
            <Link to="/telecalling/calls" className="inline-block text-xs text-primary hover:underline">Open the telecalling call queue →</Link>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function Kpi({ label, value, sub, style, tone }: { label: string; value: React.ReactNode; sub: string; style: React.CSSProperties; tone?: "warn" }) {
  return (
    <div className="lux-card lux-sheen rise p-4" style={style}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "warn" && "text-warning")}>{value}</div>
      <div className="mt-1 text-[11.5px] text-muted-foreground">{sub}</div>
    </div>
  );
}
