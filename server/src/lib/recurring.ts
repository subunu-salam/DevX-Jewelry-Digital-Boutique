import { prisma } from "../prisma.js";
import { demoClients, liveClients, scoreClient, type ClientIn } from "./retention.js";

/**
 * Recurring-customer leads for the telecalling team.
 *
 * Every client with a purchase is placed in a segment by how often they've bought —
 * first-time, second-time, recurring (3+), continuous (4+ on a steady rhythm) — and we
 * learn their personal cycle (e.g. "every ~30 days"). When a repeat buyer passes their
 * usual cycle without buying (e.g. 30 days for a monthly buyer), they become an alert
 * for telecalling. We also show whether their spend went up or down in the last 3 months
 * versus the 3 months before.
 */

export type Segment = "ONE_TIME" | "SECOND_TIME" | "RECURRING" | "CONTINUOUS";
export const SEGMENT_LABEL: Record<Segment, string> = {
  ONE_TIME: "First-time buyers", SECOND_TIME: "Second-time buyers", RECURRING: "Recurring (3+)", CONTINUOUS: "Continuous buyers",
};
const DAY = 864e5;
const FIRST_BUY_NUDGE_DAYS = 60; // nudge a first-time buyer towards their second purchase after this

export interface RecurringLead {
  id: string; name: string; phone: string | null; branch: string | null; tier: string;
  segment: Segment; orders: number; cycleDays: number; daysSince: number | null; overdueBy: number;
  lastPurchase: string | null; lastItem: string | null; lifetimeSpend: number;
  spendLast3m: number; spendPrev3m: number; trend: "UP" | "DOWN" | "STEADY" | "NEW"; trendPct: number | null;
  alert: boolean; alertText: string; priority: "HIGH" | "MEDIUM" | "LOW"; openCall: boolean; script: string;
}

function segmentOf(c: ClientIn, cycle: number): Segment {
  const n = c.purchases.length;
  if (n <= 1) return "ONE_TIME";
  if (n === 2) return "SECOND_TIME";
  if (n >= 4) {
    const ps = [...c.purchases].sort((a, b) => +a.at - +b.at);
    const gaps = ps.slice(1).map((p, i) => (+p.at - +ps[i].at) / DAY);
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
    if (mean > 0 && sd / mean < 0.5 && cycle <= 120) return "CONTINUOUS";
  }
  return "RECURRING";
}

export function toLead(c: ClientIn, now = new Date()): RecurringLead {
  const s = scoreClient(c, now);
  const t = now.getTime();
  const last3 = c.purchases.filter((p) => t - +p.at <= 90 * DAY).reduce((a, p) => a + p.amount, 0);
  const prev3 = c.purchases.filter((p) => t - +p.at > 90 * DAY && t - +p.at <= 180 * DAY).reduce((a, p) => a + p.amount, 0);
  const trend = c.purchases.length < 2 ? "NEW" : prev3 === 0 && last3 === 0 ? "DOWN" : prev3 === 0 ? "UP" : last3 > prev3 * 1.15 ? "UP" : last3 < prev3 * 0.85 ? "DOWN" : "STEADY";
  const trendPct = prev3 ? Math.round(((last3 - prev3) / prev3) * 100) : null;
  const segment = segmentOf(c, s.avgGapDays);
  const ds = s.daysSince ?? 0;
  const overdueBy = segment === "ONE_TIME" ? Math.max(0, ds - FIRST_BUY_NUDGE_DAYS) : Math.max(0, ds - s.avgGapDays);
  const alert = overdueBy > 0;
  const first = c.name.split(" ")[0];
  const alertText = !alert
    ? `On rhythm — next purchase expected in ~${Math.max(0, s.avgGapDays - ds)} days`
    : segment === "ONE_TIME"
      ? `First purchase ${ds} days ago — no second visit yet`
      : `Hasn't purchased for ${ds} days — usually buys every ~${s.avgGapDays} days`;
  const priority: RecurringLead["priority"] = !alert ? "LOW"
    : segment === "ONE_TIME" ? (s.tier === "Noir" || s.tier === "Platinum" ? "HIGH" : "MEDIUM")
    : segment === "CONTINUOUS" || segment === "RECURRING" || s.tier === "Noir" || s.tier === "Platinum" ? "HIGH" : "MEDIUM";
  const script = segment === "ONE_TIME"
    ? `Hi ${first}, this is Aurelia — thank you again for your ${s.lastItem ?? "purchase"}. How are you enjoying it? We have a few new pieces that would pair beautifully with it; may I share them?`
    : `Hi ${first}, this is Aurelia. We noticed we haven't seen you in a while — is everything alright? If you're planning a trip home or have an occasion coming up, we'd love to help, and I can check a special offer for you.`;
  return {
    id: s.id, name: s.name, phone: s.phone, branch: s.branch, tier: s.tier, segment, orders: s.orders, cycleDays: s.avgGapDays,
    daysSince: s.daysSince, overdueBy, lastPurchase: s.lastPurchase, lastItem: s.lastItem, lifetimeSpend: s.lifetimeSpend,
    spendLast3m: Math.round(last3), spendPrev3m: Math.round(prev3), trend, trendPct, alert, alertText, priority, openCall: s.openCall, script,
  };
}

/** Gold-plan instalments that are late — also a reason to call. */
async function planDues(tenantId: string, now = new Date()) {
  const plans = await prisma.goldPlan.findMany({
    where: { tenantId, status: "ACTIVE" },
    include: { customer: { select: { id: true, name: true, phone: true } }, payments: { select: { paidAt: true } } },
  });
  return plans.map((p) => {
    const monthsElapsed = Math.floor((now.getTime() - p.startDate.getTime()) / (30.44 * DAY));
    const due = Math.min(p.tenureMonths, monthsElapsed + 1);
    const missed = Math.max(0, due - p.payments.length);
    return { planId: p.id, reference: p.reference, customerId: p.customer.id, name: p.customer.name, phone: p.customer.phone, monthlyAmount: p.monthlyAmount, missed, paid: p.payments.length, tenure: p.tenureMonths };
  }).filter((x) => x.missed > 0);
}

export async function buildRecurring(tenantId: string, source: "auto" | "live" | "demo" = "auto") {
  const now = new Date();
  let clients: ClientIn[] = [];
  let used: "live" | "demo" = "live";
  let note: string | null = null;
  if (source !== "demo") clients = await liveClients(tenantId);
  if (source === "demo" || (source === "auto" && clients.length < 8)) {
    if (source === "auto") note = `Only ${clients.length} client${clients.length === 1 ? "" : "s"} with purchases so far — showing a sample client book. Real leads appear as invoices are recorded.`;
    const queued = new Set((await prisma.callTask.findMany({ where: { tenantId, status: "OPEN", customerId: null }, select: { customerName: true } })).map((c) => c.customerName));
    clients = demoClients(now).map((c) => ({ ...c, openCall: queued.has(c.name) }));
    used = "demo";
  }
  // Most saveable first: alerts → high priority → frequent buyers → most recently overdue.
  const rank: Record<Segment, number> = { CONTINUOUS: 0, RECURRING: 1, SECOND_TIME: 2, ONE_TIME: 3 };
  const pr = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  const leads = clients.map((c) => toLead(c, now)).sort((a, b) =>
    Number(b.alert) - Number(a.alert) || pr[a.priority] - pr[b.priority] || rank[a.segment] - rank[b.segment] || a.overdueBy / a.cycleDays - b.overdueBy / b.cycleDays);
  const segs = (Object.keys(SEGMENT_LABEL) as Segment[]).map((k) => {
    const m = leads.filter((l) => l.segment === k);
    return { segment: k, label: SEGMENT_LABEL[k], count: m.length, alerts: m.filter((l) => l.alert).length, spend: m.reduce((s, l) => s + l.lifetimeSpend, 0) };
  });
  const dues = await planDues(tenantId, now).catch(() => []);
  const repeaters = leads.filter((l) => l.orders >= 2);
  return {
    source: used, note, generatedAt: now.toISOString(),
    kpis: {
      clients: leads.length,
      repeatRate: leads.length ? Math.round((repeaters.length / leads.length) * 100) : 0,
      alerts: leads.filter((l) => l.alert).length,
      highPriority: leads.filter((l) => l.alert && l.priority === "HIGH").length,
      trendingDown: repeaters.filter((l) => l.trend === "DOWN").length,
      trendingUp: repeaters.filter((l) => l.trend === "UP").length,
      planDues: dues.length,
    },
    segments: segs,
    leads,
    planDues: dues,
  };
}
