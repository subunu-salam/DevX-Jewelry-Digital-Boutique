import { prisma } from "../prisma.js";

/**
 * Retention engine — loyalty tiers + AI churn alerts.
 *
 * For every client with purchase history we learn their personal buying rhythm
 * (average gap between purchases), compare it with how long it has been since the
 * last one, and turn that into a churn risk. The next action depends on risk × value:
 * high-value clients drifting away go to the telecalling team; others get an
 * automated win-back / reminder campaign.
 */

export type Tier = "Noir" | "Platinum" | "Gold" | "Silver";
export type Risk = "Healthy" | "Due" | "At risk" | "Lapsed";
export type Action = "CALL" | "WINBACK_CAMPAIGN" | "REMINDER_CAMPAIGN" | "NURTURE";

export const TIERS: { tier: Tier; min: number; perks: string; color: string }[] = [
  { tier: "Noir", min: 250_000, perks: "Private viewings, free resizing for life, personal stylist, 3× points", color: "#1f1c18" },
  { tier: "Platinum", min: 100_000, perks: "Priority custom design, annual cleaning & insurance valuation, 2× points", color: "#9aa3b2" },
  { tier: "Gold", min: 30_000, perks: "Birthday & anniversary offers, free polishing, 1.5× points", color: "#d4af6a" },
  { tier: "Silver", min: 0, perks: "Welcome gift, points on every purchase (1 pt per AED 10)", color: "#c9c9cf" },
];
const POINT_MULT: Record<Tier, number> = { Noir: 3, Platinum: 2, Gold: 1.5, Silver: 1 };
export const tierFor = (spend: number): Tier => (TIERS.find((t) => spend >= t.min) ?? TIERS[TIERS.length - 1]).tier;

const DAY = 864e5;
const DEFAULT_GAP = 150; // days — typical repeat cycle for fine jewellery when a client has one purchase

export interface Purchase { at: Date; amount: number; item?: string | null }
export interface ClientIn {
  id: string; name: string; phone: string | null; email?: string | null; branch?: string | null;
  consent?: boolean; purchases: Purchase[]; openCall?: boolean; lastOccasion?: string | null;
}
export interface ClientOut {
  id: string; name: string; phone: string | null; branch: string | null; consent: boolean;
  tier: Tier; nextTier: Tier | null; toNextTier: number; points: number;
  orders: number; lifetimeSpend: number; spend12m: number; aov: number;
  lastPurchase: string | null; lastItem: string | null; daysSince: number | null;
  avgGapDays: number; expectedNext: string | null;
  risk: Risk; churnScore: number; action: Action; actionLabel: string; why: string[]; script: string;
  openCall: boolean;
}

export function scoreClient(c: ClientIn, now = new Date()): ClientOut {
  const ps = [...c.purchases].sort((a, b) => a.at.getTime() - b.at.getTime());
  const lifetime = ps.reduce((s, p) => s + p.amount, 0);
  const spend12m = ps.filter((p) => now.getTime() - p.at.getTime() <= 365 * DAY).reduce((s, p) => s + p.amount, 0);
  const tier = tierFor(lifetime);
  const ti = TIERS.findIndex((t) => t.tier === tier);
  const next = ti > 0 ? TIERS[ti - 1] : null;
  const gaps = ps.slice(1).map((p, i) => (p.at.getTime() - ps[i].at.getTime()) / DAY).filter((g) => g > 3);
  // Recent gaps weigh more — a client's rhythm changes.
  const avgGap = gaps.length ? Math.max(21, Math.round(gaps.reduce((s, g, i) => s + g * (i + 1), 0) / gaps.reduce((s, _g, i) => s + i + 1, 0))) : DEFAULT_GAP;
  const last = ps.at(-1);
  const daysSince = last ? Math.floor((now.getTime() - last.at.getTime()) / DAY) : null;
  const ratio = daysSince == null ? 0 : daysSince / avgGap;

  const risk: Risk = daysSince == null ? "Healthy" : ratio < 0.85 ? "Healthy" : ratio < 1.25 ? "Due" : ratio < 2.2 ? "At risk" : "Lapsed";
  const valueW = { Noir: 1, Platinum: 0.9, Gold: 0.75, Silver: 0.55 }[tier];
  const churnScore = Math.round(Math.min(99, Math.max(1, (1 / (1 + Math.exp(-3 * (ratio - 1.4)))) * 100 * (0.7 + 0.3 * valueW))));

  const highValue = ti <= 2; // Gold and above
  let action: Action = "NURTURE";
  if (risk === "Lapsed" || risk === "At risk") action = highValue ? "CALL" : "WINBACK_CAMPAIGN";
  else if (risk === "Due") action = tier === "Noir" || tier === "Platinum" ? "CALL" : "REMINDER_CAMPAIGN";
  const actionLabel = { CALL: "Telecall follow-up", WINBACK_CAMPAIGN: "Win-back campaign", REMINDER_CAMPAIGN: "New-arrivals reminder", NURTURE: "Keep nurturing" }[action];

  const why: string[] = [];
  if (daysSince != null) why.push(`${daysSince} days since last purchase (usually every ~${avgGap})`);
  if (ps.length >= 3) why.push(`${ps.length} purchases — a regular`);
  if (spend12m === 0 && lifetime > 0) why.push("No purchase in 12 months");
  if (next && next.min - lifetime < next.min * 0.25) why.push(`${Math.round(next.min - lifetime).toLocaleString()} AED from ${next.tier}`);
  if (c.lastOccasion) why.push(`Last bought for ${c.lastOccasion.toLowerCase()}`);

  const first = c.name.split(" ")[0];
  const script =
    action === "CALL"
      ? `Hi ${first}, this is Aurelia. We've missed you! As a ${tier} client you have ${Math.round((lifetime / 10) * POINT_MULT[tier]).toLocaleString()} points — we'd love to invite you for a private preview of the new collection. Would this week suit you?`
      : action === "WINBACK_CAMPAIGN"
        ? `${first}, it's been a while ✨ Enjoy complimentary polishing + double points on your next visit to Aurelia this month.`
        : action === "REMINDER_CAMPAIGN"
          ? `${first}, new pieces just arrived that match your taste — reply to book a viewing at your favourite boutique.`
          : `Thank ${first} for their recent purchase and share care tips.`;

  return {
    id: c.id, name: c.name, phone: c.phone, branch: c.branch ?? null, consent: c.consent ?? false,
    tier, nextTier: next?.tier ?? null, toNextTier: next ? Math.max(0, Math.round(next.min - lifetime)) : 0,
    points: Math.round((lifetime / 10) * POINT_MULT[tier]),
    orders: ps.length, lifetimeSpend: Math.round(lifetime), spend12m: Math.round(spend12m), aov: ps.length ? Math.round(lifetime / ps.length) : 0,
    lastPurchase: last ? last.at.toISOString() : null, lastItem: last?.item ?? null, daysSince, avgGapDays: avgGap,
    expectedNext: last ? new Date(last.at.getTime() + avgGap * DAY).toISOString() : null,
    risk, churnScore, action, actionLabel, why, script, openCall: !!c.openCall,
  };
}

/* ───────────── Data sources ───────────── */

export async function liveClients(tenantId: string): Promise<ClientIn[]> {
  const [customers, openCalls] = await Promise.all([
    prisma.customer.findMany({
      where: { tenantId },
      include: {
        invoices: { where: { status: { in: ["ISSUED", "PAID", "PARTIAL"] } }, include: { items: { take: 1 }, branch: true } },
        inquiries: { select: { occasion: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.callTask.findMany({ where: { tenantId, status: "OPEN", customerId: { not: null } }, select: { customerId: true } }),
  ]);
  const open = new Set(openCalls.map((c) => c.customerId));
  return customers
    .filter((c) => c.invoices.length > 0)
    .map((c) => ({
      id: c.id, name: c.name, phone: c.phone, email: c.email, consent: c.marketingConsent,
      branch: c.invoices.at(-1)?.branch?.name ?? null, lastOccasion: c.inquiries[0]?.occasion ?? null, openCall: open.has(c.id),
      purchases: c.invoices.map((i) => ({ at: i.issuedAt ?? i.createdAt, amount: i.total, item: i.items[0]?.description ?? null })),
    }));
}

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const FIRST = ["Fatima", "Aisha", "Mariam", "Noura", "Layla", "Sara", "Hessa", "Reem", "Priya", "Ananya", "Meera", "Elena", "Sophie", "Omar", "Khalid", "Rahul", "Arjun", "Daniel", "Yusuf", "Hamdan", "Lina", "Dana", "Rania", "Zara", "Amal", "Salma", "Kavya", "Nadia", "Hind", "Shamma"];
const LAST = ["Al Mansoori", "Al Hashimi", "Khan", "Nair", "Menon", "Haddad", "Al Falasi", "Rahman", "Al Suwaidi", "Kapoor", "Rossi", "Laurent", "Al Qassimi", "Iyer", "Saeed", "Al Ketbi", "Joseph", "Fernandes"];
const ITEMS = ["Solitaire Halo Ring", "22K Heritage Choker", "Diamond Tennis Bracelet", "Pearl & Gold Strand", "Emerald Drop Earrings", "Evil-Eye Gold Pendant", "Bridal Polki Set", "Rose Gold Bangle", "Sapphire Cocktail Ring", "Men's Signet Ring"];
const OCC = ["Bridal", "Anniversary", "Birthday", "Eid", "Diwali", "Gift", "Everyday", null];
const BRANCHES = ["Dubai Mall Flagship", "Gold Souk", "Abu Dhabi Galleria"];

export function demoClients(now = new Date()): ClientIn[] {
  const r = rng(77031);
  const out: ClientIn[] = [];
  for (let i = 0; i < 64; i++) {
    const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
    // Mix of segments: loyal regulars, drifting regulars, one-timers, VIPs.
    const kind = r();
    const n = kind < 0.12 ? 6 + Math.floor(r() * 5) : kind < 0.45 ? 3 + Math.floor(r() * 3) : kind < 0.75 ? 2 : 1;
    const gap = kind < 0.12 ? 26 + r() * 50 : 60 + r() * 160; // VIPs often buy monthly
    const drift = r() < 0.38 ? 1.4 + r() * 2.2 : 0.2 + r() * 1.0; // ~38% are drifting away
    const lastAgo = Math.round(gap * drift);
    const base = kind < 0.12 ? 22000 + r() * 40000 : kind < 0.45 ? 7000 + r() * 16000 : 2500 + r() * 14000;
    const purchases: Purchase[] = [];
    for (let k = 0; k < n; k++) {
      const ago = lastAgo + (n - 1 - k) * gap * (0.75 + r() * 0.5);
      purchases.push({ at: new Date(now.getTime() - ago * DAY), amount: Math.round((base * (0.6 + r() * 0.9)) / 50) * 50, item: ITEMS[Math.floor(r() * ITEMS.length)] });
    }
    out.push({
      id: `demo-${i + 1}`, name, phone: `+971 5${Math.floor(r() * 9)} ${100 + Math.floor(r() * 899)} ${1000 + Math.floor(r() * 8999)}`,
      branch: BRANCHES[Math.floor(r() * 3)], consent: r() < 0.7, purchases, lastOccasion: OCC[Math.floor(r() * OCC.length)], openCall: false,
    });
  }
  return out;
}

/* ───────────── Report ───────────── */

export async function buildRetention(tenantId: string, source: "auto" | "live" | "demo" = "auto") {
  const now = new Date();
  let clients: ClientIn[] = [];
  let used: "live" | "demo" = "live";
  let note: string | null = null;
  if (source !== "demo") clients = await liveClients(tenantId);
  if (source === "demo" || (source === "auto" && clients.length < 8)) {
    if (source === "auto") note = `Only ${clients.length} client${clients.length === 1 ? "" : "s"} with purchases so far — showing a sample book of 64 clients. Real alerts appear as invoices are recorded.`;
    // Mark demo clients that already have a call queued (tasks raised from the demo carry the demo id in notes).
    const queued = new Set((await prisma.callTask.findMany({ where: { tenantId, status: "OPEN", customerId: null }, select: { customerName: true } })).map((c) => c.customerName));
    clients = demoClients(now).map((c) => ({ ...c, openCall: queued.has(c.name) }));
    used = "demo";
  }

  const scored = clients.map((c) => scoreClient(c, now)).sort((a, b) => b.churnScore * (b.lifetimeSpend + 1) - a.churnScore * (a.lifetimeSpend + 1));
  const repeat = scored.filter((c) => c.orders >= 2).length;
  const alerts = scored.filter((c) => c.risk === "At risk" || c.risk === "Lapsed" || (c.risk === "Due" && c.action === "CALL"));
  const atRiskValue = alerts.reduce((s, c) => s + c.aov, 0);
  const tiers = TIERS.map((t) => {
    const members = scored.filter((c) => c.tier === t.tier);
    return { ...t, count: members.length, atRisk: members.filter((c) => c.risk === "At risk" || c.risk === "Lapsed").length, spend: members.reduce((s, c) => s + c.lifetimeSpend, 0) };
  });
  const riskMix = (["Healthy", "Due", "At risk", "Lapsed"] as Risk[]).map((risk) => ({ risk, count: scored.filter((c) => c.risk === risk).length }));
  const calls = alerts.filter((c) => c.action === "CALL");
  const campaigns = alerts.filter((c) => c.action !== "CALL" && c.action !== "NURTURE");

  return {
    source: used, note, generatedAt: now.toISOString(),
    headline: alerts.length
      ? `${alerts.length} clients are buying less often than usual — about AED ${Math.round(atRiskValue / 1000)}k of typical orders at stake. ${calls.length} high-value clients should get a call; ${campaigns.length} can get an automated win-back.`
      : "Every client is buying on their usual rhythm — nothing to chase today.",
    kpis: {
      clients: scored.length,
      repeatRate: scored.length ? Math.round((repeat / scored.length) * 100) : 0,
      alerts: alerts.length,
      atRiskValue: Math.round(atRiskValue),
      callsSuggested: calls.length,
      campaignsSuggested: campaigns.length,
      avgGap: scored.length ? Math.round(scored.reduce((s, c) => s + c.avgGapDays, 0) / scored.length) : 0,
    },
    tiers, riskMix, alerts, clients: scored,
  };
}
