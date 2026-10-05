import { useState } from "react";
import { motion } from "motion/react";
import { Loader2, Sparkles } from "lucide-react";
import { ownerFetch } from "@/lib/owner";
import SubHeader from "@/components/SubHeader";
import OwnerGate from "@/components/OwnerGate";

interface Insight { title: string; detail: string; type: string; metric: string }

const TONE: Record<string, string> = {
  opportunity: "border-l-[var(--color-ok,#2F7D5B)]",
  watch: "border-l-[#B4791E]",
  action: "border-l-brand",
};

export default function Intelligence() {
  return (
    <div>
      <SubHeader title="Jewelry Intelligence" to="/ai" />
      <OwnerGate>
        <Panel />
      </OwnerGate>
    </div>
  );
}

function Panel() {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [ai, setAi] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true); setError(null);
    try {
      const res = await ownerFetch<{ ai: boolean; insights: Insight[] }>("/api/ai/intelligence");
      setInsights(res.insights); setAi(res.ai);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 pt-1">
      <p className="text-[14px] leading-relaxed text-muted-foreground">
        Predictive insights computed from your real sales, stock velocity, inquiries and conversion — across all branches.
      </p>
      <button onClick={generate} disabled={loading} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-3.5 text-sm font-semibold text-background disabled:opacity-50">
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {loading ? "Analysing your data…" : "Generate insights"}
      </button>
      {error && <div className="mt-4 rounded-2xl bg-sand p-4 text-sm">{error}</div>}
      {insights && (
        <div className="mt-4">
          <div className="eyebrow mb-2">{insights.length} insights · {ai ? "AI-enriched" : "computed from your data"}</div>
          <div className="space-y-2.5">
            {insights.map((i, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06 }}
                className={`rounded-2xl border border-l-[3px] border-border bg-surface p-4 ${TONE[i.type] ?? "border-l-brand"}`}
              >
                <div className="font-serif text-[19px] leading-tight">{i.title}</div>
                <div className="mt-1 text-[13px] leading-snug text-muted-foreground">{i.detail}</div>
                {i.metric && <span className="mt-2.5 inline-block rounded-full bg-sand px-2.5 py-1 text-[11px] font-semibold text-brand-deep">{i.metric}</span>}
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
