import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BrainCircuit, CheckCircle2, Database, Sparkles } from "lucide-react";
import { cn } from "@ui";
import { CAT, GRID, MUTED, SectionHeader, tooltipStyle } from "@/components/lux";

/**
 * "Track record" — how close past predictions came to what actually happened, and how
 * often recommended actions paid off. Until a boutique has enough history this is a
 * clearly-labelled illustrative series; the shape (error shrinking as the model learns
 * the boutique) is the story we show clients.
 */

// Deterministic PRNG so the sample never jumps between renders / reloads.
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const WEEKS = 12;
function buildWeekly(scale: number) {
  const r = rng(20261012);
  const out: { week: string; actual: number; predicted: number; accuracy: number }[] = [];
  const now = new Date();
  for (let i = 0; i < WEEKS; i++) {
    const d = new Date(now.getTime() - (WEEKS - i) * 7 * 864e5);
    const season = 1 + 0.18 * Math.sin((i / WEEKS) * Math.PI * 2 + 0.8);
    const actual = Math.round(scale * season * (0.9 + r() * 0.2));
    // Error band narrows from ~±20% (cold start) to ~±5% (learned) — sign varies so it's believable.
    const t = i / (WEEKS - 1);
    const lo = 0.12 - 0.09 * t, hi = 0.24 - 0.16 * t; // never exact: ≥3% off even when learned
    const sign = (i * 7 + 3) % 5 < 2 ? -1 : 1;
    const err = sign * (lo + r() * (hi - lo));
    const predicted = Math.max(1, Math.round(actual * (1 + err)));
    const accuracy = Math.round(Math.max(0, 1 - Math.abs(predicted - actual) / actual) * 100);
    out.push({ week: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }), actual, predicted, accuracy });
  }
  return out;
}

const RECS = [
  { area: "Lead follow-ups", suggested: 42, acted: 35, worked: 27 },
  { area: "Quote reminders", suggested: 31, acted: 26, worked: 17 },
  { area: "Staffing", suggested: 8, acted: 6, worked: 5 },
  { area: "Restock", suggested: 14, acted: 11, worked: 8 },
  { area: "Campaigns", suggested: 10, acted: 7, worked: 4 },
];

export default function TrackRecord({ weeklyScale = 60, live = false, delay = 0 }: { weeklyScale?: number; live?: boolean; delay?: number }) {
  const weekly = useMemo(() => buildWeekly(Math.max(12, weeklyScale)), [weeklyScale]);
  const first4 = avg(weekly.slice(0, 4).map((w) => w.accuracy));
  const last4 = avg(weekly.slice(-4).map((w) => w.accuracy));
  const acted = RECS.reduce((s, x) => s + x.acted, 0);
  const worked = RECS.reduce((s, x) => s + x.worked, 0);
  const recRows = RECS.map((x) => ({ ...x, rate: Math.round((x.worked / x.acted) * 100) }));
  const tag = (
    <span className="rounded-full border border-warning/40 bg-warning-bg px-2 py-0.5 text-[10.5px] font-medium text-warning">
      {live ? "Sample — your own track record appears after 4 weeks of data" : "Illustrative sample"}
    </span>
  );

  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_1fr]">
      {/* Predicted vs actual */}
      <section className="lux-card rise p-5" style={{ ["--d" as string]: `${delay}ms` } as React.CSSProperties}>
        <SectionHeader title="Track record · predicted vs what actually happened" right={tag} />
        <div className="mb-3 flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Accuracy, first 4 weeks</div>
            <div className="text-2xl font-semibold tabular-nums">{first4}%</div>
          </div>
          <div className="pb-1 text-muted-foreground">→</div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Accuracy, last 4 weeks</div>
            <div className="text-2xl font-semibold tabular-nums text-success">{last4}%</div>
          </div>
          <div className="ml-auto flex gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: CAT[0] }} /> Actual inquiries</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: CAT[1] }} /> Our prediction (made a week before)</span>
          </div>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weekly} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 6" vertical={false} stroke={GRID} />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} minTickGap={18} />
              <YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: CAT[0], strokeOpacity: 0.3 }}
                formatter={(v: number, n: string) => [v, n === "actual" ? "Actual" : "Predicted"]}
                labelFormatter={(l: string) => `Week of ${l}`} />
              <Line type="monotone" dataKey="actual" stroke={CAT[0]} strokeWidth={2} dot={{ r: 3, fill: CAT[0], strokeWidth: 0 }} activeDot={{ r: 5 }} animationDuration={1300} />
              <Line type="monotone" dataKey="predicted" stroke={CAT[1]} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: CAT[1], strokeWidth: 0 }} activeDot={{ r: 5 }} animationDuration={1600} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Accuracy per week — its own small chart, one unit (%) */}
        <div className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">Weekly accuracy · target 90%</div>
        <div className="h-24">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly} margin={{ top: 6, right: 8, left: -14, bottom: 0 }} barCategoryGap="28%">
              <XAxis dataKey="week" hide />
              <YAxis domain={[50, 100]} ticks={[50, 75, 100]} tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} width={40} unit="%" />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={(v: number) => [`${v}%`, "Accuracy"]} labelFormatter={(l: string) => `Week of ${l}`} />
              <ReferenceLine y={90} stroke={MUTED} strokeDasharray="3 4" />
              <Bar dataKey="accuracy" fill={CAT[3]} radius={[4, 4, 0, 0]} animationDuration={1200} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Predictions aren't perfect — some weeks over, some under — but the gap narrows as the system learns this boutique's rhythm.</p>
      </section>

      {/* Recommendations that worked */}
      <section className="lux-card rise p-5" style={{ ["--d" as string]: `${delay + 120}ms` } as React.CSSProperties}>
        <SectionHeader title="Did our recommendations work?" right={tag} />
        <div className="mb-3 flex flex-wrap items-end gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Success rate when acted on</div>
            <div className="text-2xl font-semibold tabular-nums">{Math.round((worked / acted) * 100)}%</div>
          </div>
          <div className="text-xs text-muted-foreground">{worked} of {acted} actions led to a sale, booking or recovered quote</div>
        </div>
        <div className="mb-2 flex gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: CAT[1] }} /> Acted on</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: CAT[0] }} /> Worked</span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={recRows} layout="vertical" margin={{ top: 0, right: 34, left: 8, bottom: 0 }} barCategoryGap="26%" barGap={2}>
              <CartesianGrid strokeDasharray="3 6" horizontal={false} stroke={GRID} />
              <XAxis type="number" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="area" tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} width={104} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }}
                formatter={(v: number, n: string) => [v, n === "acted" ? "Acted on" : "Worked"]}
                labelFormatter={(l: string) => { const r = recRows.find((x) => x.area === l); return r ? `${l} · ${r.rate}% success` : l; }} />
              <Bar dataKey="acted" fill={CAT[1]} radius={[0, 4, 4, 0]} animationDuration={1100} />
              <Bar dataKey="worked" fill={CAT[0]} radius={[0, 4, 4, 0]} animationDuration={1400} label={{ position: "right", fill: MUTED, fontSize: 10, formatter: (v: number) => v }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1 text-center text-[10.5px] text-muted-foreground">
          {recRows.map((r) => <div key={r.area}><div className="font-semibold text-foreground tabular-nums">{r.rate}%</div>{r.area.split(" ")[0]}</div>)}
        </div>
      </section>

      {/* How it gets better */}
      <section className="lux-card rise p-5 xl:col-span-2" style={{ ["--d" as string]: `${delay + 240}ms` } as React.CSSProperties}>
        <SectionHeader title="How the AI gets better with your data" />
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { icon: Database, title: "Weeks 1–4 · Starting point", text: "Uses proven jewellery-retail patterns (weekday peaks, occasions, gold-price swings). Good guidance, wider error bars.", acc: "~70–80%", here: false },
            { icon: BrainCircuit, title: "Months 2–3 · Learning you", text: "Every lead, quote and sale tunes the model to your boutiques, advisors and customers. Predictions tighten week by week.", acc: "~85–90%", here: true },
            { icon: Sparkles, title: "Month 4+ · Your own AI", text: "Confident forecasts, lead scores and next-best actions built on your history — with the success rate tracked here.", acc: "90%+", here: false },
          ].map((s) => (
            <div key={s.title} className={cn("relative rounded-xl border p-4", s.here ? "border-primary/60 bg-primary/[0.06]" : "border-border bg-muted/30")}>
              {s.here && <span className="absolute -top-2.5 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">Typical by now</span>}
              <div className="flex items-center gap-2"><s.icon className="size-4 text-primary" /><span className="text-sm font-medium">{s.title}</span></div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{s.text}</p>
              <div className="mt-3 inline-flex items-center gap-1.5 text-xs"><CheckCircle2 className="size-3.5 text-success" /> Expected accuracy {s.acc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const avg = (v: number[]) => Math.round(v.reduce((s, x) => s + x, 0) / Math.max(1, v.length));
