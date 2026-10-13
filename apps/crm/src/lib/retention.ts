export type Tier = "Noir" | "Platinum" | "Gold" | "Silver";
export type Risk = "Healthy" | "Due" | "At risk" | "Lapsed";
export type Action = "CALL" | "WINBACK_CAMPAIGN" | "REMINDER_CAMPAIGN" | "NURTURE";

export interface Client {
  id: string; name: string; phone: string | null; branch: string | null; consent: boolean;
  tier: Tier; nextTier: Tier | null; toNextTier: number; points: number;
  orders: number; lifetimeSpend: number; spend12m: number; aov: number;
  lastPurchase: string | null; lastItem: string | null; daysSince: number | null;
  avgGapDays: number; expectedNext: string | null;
  risk: Risk; churnScore: number; action: Action; actionLabel: string; why: string[]; script: string; openCall: boolean;
}
export interface RetentionReport {
  source: "live" | "demo"; note: string | null; generatedAt: string; headline: string;
  kpis: { clients: number; repeatRate: number; alerts: number; atRiskValue: number; callsSuggested: number; campaignsSuggested: number; avgGap: number };
  tiers: { tier: Tier; min: number; perks: string; color: string; count: number; atRisk: number; spend: number }[];
  riskMix: { risk: Risk; count: number }[];
  alerts: Client[];
  clients: Client[];
}
export interface CallTask {
  id: string; customerId: string | null; customerName: string; customerPhone: string | null;
  assignedToId: string | null; assignedTo: string | null; source: string; reason: string; tier: string | null;
  priority: "HIGH" | "MEDIUM" | "LOW"; status: "OPEN" | "DONE"; outcome: string | null; notes: string | null;
  attempts: number; dueAt: string; completedAt: string | null; createdAt: string;
}

export const TIER_STYLE: Record<Tier, { chip: string; dot: string }> = {
  Noir: { chip: "border-[#e9eaee]/30 bg-[#e9eaee]/10 text-[#e9eaee]", dot: "#e9eaee" },
  Platinum: { chip: "border-[#9fb3c8]/40 bg-[#9fb3c8]/10 text-[#b9cbe0]", dot: "#9fb3c8" },
  Gold: { chip: "border-primary/40 bg-primary/10 text-primary", dot: "#d4af6a" },
  Silver: { chip: "border-border bg-muted text-muted-foreground", dot: "#8b93a3" },
};
export const RISK_STYLE: Record<Risk, { chip: string; color: string }> = {
  Healthy: { chip: "bg-success-bg text-success", color: "#4ade80" },
  Due: { chip: "bg-info-bg text-info", color: "#60a5fa" },
  "At risk": { chip: "bg-warning-bg text-warning", color: "#fbbf24" },
  Lapsed: { chip: "bg-danger-bg text-danger", color: "#f87171" },
};
export const OUTCOMES: { value: string; label: string; done: boolean }[] = [
  { value: "REACHED", label: "Reached — follow-up done", done: true },
  { value: "VISIT_BOOKED", label: "Visit booked 🎉", done: true },
  { value: "CALLBACK", label: "Asked to call back", done: false },
  { value: "NO_ANSWER", label: "No answer", done: false },
  { value: "NOT_INTERESTED", label: "Not interested", done: true },
  { value: "WRONG_NUMBER", label: "Wrong number", done: true },
];
export const waLink = (phone: string | null, text: string) => `https://wa.me/${(phone ?? "").replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`;
