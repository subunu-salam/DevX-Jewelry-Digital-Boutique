import { useEffect, useState } from "react";
import { api } from "./api";
import type { Recommendation } from "@/components/lux";

export type Source = "auto" | "live" | "demo";
export interface ScoredLead {
  id: string; reference: string; customer: string; stage: string; branch: string | null; budget: number | null;
  score: number; band: "Hot" | "Warm" | "Cool"; reasons: string[]; next: string;
}
export interface ForecastPoint { date: string; actual: number | null; predicted: number | null; low: number | null; high: number | null }
export interface Insights {
  source: "live" | "demo";
  note: string | null;
  generatedAt: string;
  headline: string;
  kpis: { winRate: number; quotedWithin24h: number; pipelineValue: number; aov: number; forecast7: number; trendPct: number; confidence: number; hotLeads: number };
  forecast: { points: ForecastPoint[]; busiestDay: string | null; confidence: { level: string; accuracy: number; text: string } };
  recommendations: Recommendation[];
  leads: ScoredLead[];
}
interface Raw extends Omit<Insights, "recommendations"> {
  recommendations: { category: string; title: string; detail: string; impact: string; confidence: number; link?: string }[];
}

const cache = new Map<Source, { at: number; data: Insights }>();

/** AI insights (live, or the labelled demo model). Shared by the dashboard and the insights page. */
export function useInsights(source: Source = "auto") {
  const fresh = cache.get(source);
  const [data, setData] = useState<Insights | null>(fresh && Date.now() - fresh.at < 60_000 ? fresh.data : null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const hit = cache.get(source);
    if (hit && Date.now() - hit.at < 60_000) { setData(hit.data); return; }
    let alive = true;
    setError(false);
    api.get<Raw>(`/api/crm/admin/insights?source=${source}`)
      .then((r) => {
        const d: Insights = {
          ...r,
          recommendations: r.recommendations.map((x, i) => ({ id: String(i), category: x.category, title: x.title, detail: x.detail, impact: x.impact, confidence: x.confidence, action: x.link ? { label: "Open", to: x.link } : undefined })),
        };
        cache.set(source, { at: Date.now(), data: d });
        if (alive) setData(d);
      })
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [source]);
  return { data, error };
}
