import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { aed } from "@/lib/format";
import { cn } from "@ui";
import type { GoldRate as Rate } from "@/lib/types";

const RANGES = ["1M", "3M", "6M", "1Y"] as const;
type Range = (typeof RANGES)[number];

interface Point { pricePerGram: number; observedAt: string }

export default function GoldRate() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [karat, setKarat] = useState(22);
  const [range, setRange] = useState<Range>("6M");
  const [points, setPoints] = useState<Point[]>([]);
  const [ts, setTs] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ rates: Rate[]; timestamp: string }>("/api/public/gold/current").then((r) => {
      setRates(r.rates);
      setTs(r.timestamp);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api
      .get<{ points: Point[] }>(`/api/public/gold/history?karat=${karat}&range=${range}`)
      .then((r) => setPoints(r.points))
      .catch(() => setPoints([]));
  }, [karat, range]);

  const chartData = points.map((p) => ({
    date: new Date(p.observedAt).toLocaleDateString("en", { month: "short", day: "numeric" }),
    price: p.pricePerGram,
  }));
  const min = Math.min(...points.map((p) => p.pricePerGram), Infinity);
  const max = Math.max(...points.map((p) => p.pricePerGram), -Infinity);
  const first = points[0]?.pricePerGram ?? 0;
  const last = points[points.length - 1]?.pricePerGram ?? 0;
  const change = first ? ((last - first) / first) * 100 : 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 lg:px-10">
      <span className="eyebrow">Market</span>
      <h1 className="mt-2 font-serif text-4xl sm:text-5xl">Live Gold Rate</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Persisted daily observations · AED per gram · updated {ts ? new Date(ts).toLocaleString() : "—"}
      </p>

      {/* Karat cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {rates.map((r) => (
          <button
            key={r.karat}
            onClick={() => setKarat(r.karat)}
            className={cn(
              "rounded-2xl border p-5 text-left transition-colors",
              karat === r.karat ? "border-brand bg-foreground text-background" : "border-border bg-surface hover:border-brand/50",
            )}
          >
            <div className={cn("text-xs uppercase tracking-wider", karat === r.karat ? "text-background/60" : "text-muted-foreground")}>
              {r.karat}K
            </div>
            <div className="mt-2 font-serif text-2xl">{r.pricePerGram ? aed(r.pricePerGram) : "—"}</div>
            <div className={cn("text-xs", karat === r.karat ? "text-background/50" : "text-muted-foreground")}>per gram</div>
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="mt-8 rounded-3xl border border-border bg-surface p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-serif text-2xl">{karat}K trend</div>
            <div className="mt-1 flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">{range} change</span>
              <span className={cn("font-medium", change >= 0 ? "text-green-700" : "text-red-600")}>
                {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm transition-colors",
                  range === r ? "bg-brand text-white" : "bg-muted text-foreground/70 hover:text-brand",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#b08d57" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#b08d57" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#7c7364" }} minTickGap={40} axisLine={false} tickLine={false} />
              <YAxis
                domain={[Math.floor(min - 3), Math.ceil(max + 3)]}
                tick={{ fontSize: 11, fill: "#7c7364" }}
                width={44}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}`}
              />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #e7e1d6", fontSize: 13 }}
                formatter={(v: number) => [aed(v), `${karat}K / g`]}
              />
              <Area type="monotone" dataKey="price" stroke="#b08d57" strokeWidth={2} fill="url(#gold)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          If the external rate provider is unavailable, the boutique continues to show the
          last persisted observation — the experience never breaks.
        </p>
      </div>
    </div>
  );
}
