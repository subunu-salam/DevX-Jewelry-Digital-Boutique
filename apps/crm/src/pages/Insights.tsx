import { useState } from "react";
import { Link } from "react-router-dom";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Flame, Info, Sparkles, Target } from "lucide-react";
import { cn } from "@ui";
import { aed } from "@/lib/format";
import { useInsights, type Source } from "@/lib/insights";
import TrackRecord from "@/components/TrackRecord";
import { BAND, Count, DemoBadge, Empty, GOLD, GRID, INK, InsightCard, MUTED, Ring, SectionHeader, Segmented, aedShort, initials, tooltipStyle } from "@/components/lux";

const SOURCES: { value: Source; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "live", label: "My data" },
  { value: "demo", label: "Demo data" },
];
const STAGE_LABEL: Record<string, string> = { NEW: "New", QUALIFIED: "Qualified", QUOTED: "Quoted", APPOINTMENT: "Appointment" };
const dayLabel = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function Insights() {
  const [source, setSource] = useState<Source>("auto");
  const { data, error } = useInsights(source);
  let d = 0;
  const next = () => ({ ["--d" as string]: `${(d++) * 70}ms` }) as React.CSSProperties;

  return (
    <div className="pb-6">
      <div className="rise mb-6 flex flex-wrap items-end justify-between gap-4" style={next()}>
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] text-primary/80"><Sparkles className="size-3.5" /> Predictive view</div>
          <h1 className="mt-1.5 text-[28px] font-semibold tracking-tight">AI insights</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Forecasts, lead scores and next best actions from your inquiries, quotes and sales{data ? ` · updated ${new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {data && <DemoBadge source={data.source} note={data.note ?? undefined} />}
          <Segmented options={SOURCES} value={source} onChange={setSource} />
        </div>
      </div>

      {error && <div className="lux-card p-6 text-sm text-muted-foreground">Insights couldn't load. Check the API is running, then refresh.</div>}
      {!data && !error && <Skeleton />}

      {data && (
        <>
          {data.note && (
            <div className="rise mb-5 flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning-bg/60 px-4 py-3 text-[13px] text-foreground/85" style={next()}>
              <Info className="mt-0.5 size-4 shrink-0 text-warning" /> {data.note}
            </div>
          )}

          {/* Read-out */}
          <section className="lux-card lux-sheen rise relative overflow-hidden p-6" style={next()}>
            <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-primary/15 blur-3xl" />
            <div className="relative flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-[0_0_28px_-8px_rgba(212,175,106,.7)]"><Sparkles className="size-5" /></span>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/80">Today's read-out</div>
                <p className="mt-1.5 max-w-3xl text-[19px] font-medium leading-snug tracking-tight">{data.headline}</p>
              </div>
            </div>
          </section>

          {/* KPIs */}
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Kpi style={next()} label="Inquiries, next 7 days" value={<Count value={data.kpis.forecast7} />} sub={<Trend pct={data.kpis.trendPct} />} />
            <div className="lux-card rise flex items-center gap-3 p-4" style={next()}>
              <Ring value={data.kpis.confidence} size={52} stroke={4.5}>{data.kpis.confidence}%</Ring>
              <div><div className="text-xs text-muted-foreground">AI confidence</div><div className="text-[15px] font-semibold">{data.forecast.confidence.level}</div></div>
            </div>
            <Kpi style={next()} label="Hot leads" value={<Count value={data.kpis.hotLeads} />} sub={<span className="inline-flex items-center gap-1"><Flame className="size-3 text-[#f2a65a]" /> ready to close</span>} />
            <Kpi style={next()} label="Win rate" value={<><Count value={data.kpis.winRate} />%</>} sub="of closed leads" />
            <Kpi style={next()} label="Quoted within 24 h" value={<><Count value={data.kpis.quotedWithin24h} />%</>} sub={<Target24 v={data.kpis.quotedWithin24h} />} />
            <Kpi style={next()} label="Open pipeline" value={<Count value={data.kpis.pipelineValue} format={aedShort} />} sub="draft & sent quotes" />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_1fr]">
            {/* Forecast */}
            <section className="lux-card rise p-5" style={next()}>
              <SectionHeader title="Demand forecast · inquiries per day" right={<span className="text-xs text-muted-foreground">{data.forecast.busiestDay ? `Busiest: ${data.forecast.busiestDay}` : ""}</span>} />
              <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: GOLD }} /> Actual</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: INK }} /> Predicted</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-primary/20" /> 80% range</span>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.forecast.points} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                    <defs>
                      <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={GOLD} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={GOLD} stopOpacity={0.08} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 6" vertical={false} stroke={GRID} />
                    <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} minTickGap={28} />
                    <YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ stroke: GOLD, strokeOpacity: 0.3 }}
                      labelFormatter={(v: string) => dayLabel(v)}
                      formatter={(v: number | number[], n: string) => (Array.isArray(v) ? [`${v[0]} – ${v[1]}`, "80% range"] : [v, n === "actual" ? "Actual" : "Predicted"])}
                    />
                    <Area type="monotone" dataKey={(p: { low: number | null; high: number | null }) => (p.low == null ? null : [p.low, p.high])} name="range" stroke="none" fill="url(#band)" isAnimationActive animationDuration={1300} connectNulls={false} />
                    <Line type="monotone" dataKey="actual" stroke={GOLD} strokeWidth={2} dot={false} activeDot={{ r: 4 }} animationDuration={1300} connectNulls={false} />
                    <Line type="monotone" dataKey="predicted" stroke={INK} strokeOpacity={0.75} strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={{ r: 4 }} animationDuration={1600} connectNulls={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{data.forecast.confidence.text}</p>
            </section>

            {/* Recommendations */}
            <section className="lux-card rise p-5" style={next()}>
              <SectionHeader title="Recommended actions" right={<span className="text-xs text-muted-foreground">by confidence</span>} />
              {data.recommendations.length ? (
                <div className="space-y-2.5">{data.recommendations.map((r, i) => <InsightCard key={r.id} rec={r} delay={300 + i * 70} />)}</div>
              ) : <Empty text="Nothing needs action — running to pattern." />}
            </section>
          </div>

          {/* Track record: predictions vs actuals, recommendation success */}
          <TrackRecord weeklyScale={data.kpis.forecast7} live={data.source === "live"} delay={250} />

          {/* Lead scores */}
          <section className="lux-card rise mt-5 p-5" style={next()}>
            <SectionHeader title="Lead scores · who to call first" link={{ to: "/inquiries", label: "Lead board" }} />
            {data.leads.length === 0 ? <Empty text="No open leads to score." /> : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.leads.map((l, i) => {
                  const band = BAND[l.band.toLowerCase() as keyof typeof BAND];
                  return (
                    <div key={l.id} className="card-lift rise rounded-xl border border-border bg-muted/40 p-4" style={{ ["--d" as string]: `${400 + i * 70}ms` } as React.CSSProperties}>
                      <div className="flex items-start gap-3">
                        <Ring value={l.score} size={46} stroke={4} color={band.color} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{initials(l.customer)}</span>
                            <span className="truncate text-sm font-medium">{l.customer}</span>
                            <span className={cn("ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold", band.cls)}>{band.label}</span>
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">{l.reference} · {STAGE_LABEL[l.stage] ?? l.stage}{l.branch ? ` · ${l.branch}` : ""}{l.budget ? ` · ${aed(l.budget)}` : ""}</div>
                        </div>
                      </div>
                      {l.reasons.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">{l.reasons.map((r) => <span key={r} className="rounded-full border border-border px-2 py-0.5 text-[10.5px] text-foreground/75">{r}</span>)}</div>
                      )}
                      <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-primary/[0.07] px-2.5 py-2 text-[12px] text-foreground/85">
                        <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-primary" /> {l.next}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          <p className="mt-4 text-xs text-muted-foreground">
            How it works: weekday seasonality × recent trend for the forecast, back-tested on the last 7 days; lead scores weigh budget, basket, stage, channel, occasion and recency. AI outputs are guidance for your team, not decisions.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, style }: { label: string; value: React.ReactNode; sub: React.ReactNode; style: React.CSSProperties }) {
  return (
    <div className="lux-card lux-sheen rise p-4" style={style}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-[26px] font-semibold leading-none tracking-tight">{value}</div>
      <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
function Trend({ pct }: { pct: number }) {
  if (!pct) return <>flat on trend</>;
  const up = pct > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", up ? "text-success" : "text-danger")}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(pct)}% on trend
    </span>
  );
}
function Target24({ v }: { v: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="bar-grow block h-full rounded-full" style={{ width: `${Math.min(100, v)}%`, background: v >= 90 ? "#4ade80" : GOLD }} /></span>
      target 90%
    </span>
  );
}
function Skeleton() {
  return (
    <div>
      <div className="skeleton h-28 rounded-2xl" />
      <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-[106px] rounded-2xl" />)}</div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_1fr]"><div className="skeleton h-96 rounded-2xl" /><div className="skeleton h-96 rounded-2xl" /></div>
    </div>
  );
}
