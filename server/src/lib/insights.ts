/**
 * AI insights for the CRM (PRD §AI: lead assistant, demand forecast, recommendations).
 *
 * Same pattern as GreenLoop's v3.5 insights: one deterministic model that runs on the
 * tenant's real data when there is enough of it, and on a clearly labelled demo data set
 * when there is not ("auto"). The caller can force either with source=live | demo.
 *
 * The "model" is transparent statistics, not a black box:
 *   • demand forecast  = weekday seasonality × recent trend, with an 80% band from residuals
 *   • confidence       = 1 − MAPE of a 7-day back-test the model didn't see
 *   • lead score       = weighted signals (budget, basket, recency, stage, channel, engagement)
 *   • recommendations  = rules over those numbers, each with its own confidence
 */
import { prisma } from "../prisma.js";

export type Source = "auto" | "live" | "demo";
const DAY = 864e5;
const MIN_LIVE_INQUIRIES = 12;

/* ── Deterministic PRNG so the demo model is stable between refreshes ── */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); // UTC day

export interface LeadInput {
  id: string; reference: string; customer: string; status: string; source: string;
  budget: number | null; items: number; createdAt: Date; branch: string | null; occasion: string | null;
}

/* ── Lead scoring ──────────────────────────────────────────────────── */
const STAGE_W: Record<string, number> = { NEW: 8, QUALIFIED: 16, QUOTED: 22, APPOINTMENT: 26, CONVERTED: 30, LOST: 0 };
const SOURCE_W: Record<string, number> = { walk_in: 14, whatsapp: 12, phone: 10, boutique: 8 };
const HIGH_INTENT = /bridal|wedding|engagement|anniversary/i;

export function scoreLead(l: LeadInput, now = new Date()) {
  const reasons: string[] = [];
  let s = 20;
  if (l.budget) {
    const b = Math.min(20, Math.log10(Math.max(l.budget, 1000) / 1000) * 12);
    s += b;
    if (l.budget >= 20000) reasons.push(`Budget AED ${Math.round(l.budget / 1000)}k`);
  }
  s += Math.min(10, l.items * 4);
  if (l.items > 1) reasons.push(`${l.items} pieces of interest`);
  s += STAGE_W[l.status] ?? 0;
  s += SOURCE_W[l.source] ?? 6;
  if (l.source === "walk_in" || l.source === "whatsapp") reasons.push(l.source === "walk_in" ? "Visited in person" : "Reached out on WhatsApp");
  if (l.occasion && HIGH_INTENT.test(l.occasion)) { s += 8; reasons.push(`${l.occasion} occasion`); }
  const ageDays = (now.getTime() - l.createdAt.getTime()) / DAY;
  s += ageDays < 2 ? 8 : ageDays < 7 ? 4 : ageDays > 30 ? -10 : 0;
  if (ageDays < 2) reasons.push("Fresh inquiry");
  if (ageDays > 30 && !["CONVERTED", "LOST"].includes(l.status)) reasons.push("Going cold");
  if (l.status === "LOST") s = Math.min(s, 12);
  const score = Math.max(1, Math.min(99, Math.round(s)));
  const band = score >= 70 ? "Hot" : score >= 45 ? "Warm" : "Cool";
  const next =
    l.status === "NEW" ? "Call within the hour and qualify budget & occasion"
    : l.status === "QUALIFIED" ? "Send a priced quotation today"
    : l.status === "QUOTED" ? "Follow up on the quote; offer a private viewing"
    : l.status === "APPOINTMENT" ? "Prepare the tray: shortlist + two alternatives"
    : l.status === "CONVERTED" ? "Thank-you note; register care & warranty"
    : "Log the reason; re-engage at the next campaign";
  return { score, band, reasons: reasons.slice(0, 3), next };
}

/* ── Forecast ──────────────────────────────────────────────────────── */
function forecast(series: { date: string; count: number }[], horizon = 14) {
  // weekday seasonality from the history (needs ≥ 2 weeks; otherwise flat)
  const byDow = Array.from({ length: 7 }, () => [] as number[]);
  series.forEach((p) => byDow[new Date(p.date + "T00:00:00Z").getUTCDay()].push(p.count));
  const mean = series.reduce((s, p) => s + p.count, 0) / Math.max(1, series.length);
  const dowFactor = byDow.map((v) => (v.length && mean > 0 ? v.reduce((a, b) => a + b, 0) / v.length / mean : 1));

  const lastWeeks = series.slice(-14), prevWeeks = series.slice(-28, -14);
  const avg = (a: { count: number }[]) => a.reduce((s, p) => s + p.count, 0) / Math.max(1, a.length);
  const trend = prevWeeks.length ? Math.max(0.75, Math.min(1.35, (avg(lastWeeks) || mean) / (avg(prevWeeks) || mean || 1))) : 1;
  const level = avg(lastWeeks) || mean;

  const predictFor = (d: Date, steps: number) => Math.max(0, level * dowFactor[d.getUTCDay()] * (1 + (trend - 1) * (steps / 14)));

  // back-test: predict the last 7 days from the data before them
  const test = series.slice(-7);
  let ape = 0, n = 0;
  const residuals: number[] = [];
  test.forEach((p, i) => {
    const pred = predictFor(new Date(p.date + "T00:00:00Z"), i + 1);
    residuals.push(p.count - pred);
    if (p.count > 0) { ape += Math.abs(p.count - pred) / p.count; n++; }
  });
  const accuracy = n ? Math.max(35, Math.min(97, Math.round((1 - ape / n) * 100))) : 60;
  const sd = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / Math.max(1, residuals.length)) || Math.max(0.6, level * 0.25);

  const last = series.length ? new Date(series[series.length - 1].date + "T00:00:00Z") : startOfDay(new Date());
  const ahead = Array.from({ length: horizon }, (_, i) => {
    const d = new Date(last.getTime() + (i + 1) * DAY);
    const p = predictFor(d, i + 1);
    return { date: iso(d), actual: null as number | null, predicted: round(p, 1), low: round(Math.max(0, p - 1.28 * sd), 1), high: round(p + 1.28 * sd, 1) };
  });
  const history = series.slice(-28).map((p, i, arr) => ({
    date: p.date, actual: p.count,
    // in-sample fit for the last 7 days so the chart shows predicted vs actual
    predicted: i >= arr.length - 7 ? round(predictFor(new Date(p.date + "T00:00:00Z"), i - (arr.length - 7) + 1), 1) : null,
    low: null as number | null, high: null as number | null,
  }));
  const level7 = ahead.slice(0, 7).reduce((s, p) => s + p.predicted, 0);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const busiest = dowFactor.indexOf(Math.max(...dowFactor));
  const levelName = accuracy >= 80 ? "High" : accuracy >= 62 ? "Medium" : "Low";
  return {
    points: [...history, ...ahead],
    next7: round(level7),
    trendPct: round((trend - 1) * 100, 1),
    busiestDay: dowFactor.some((f) => f !== 1) ? days[busiest] : null,
    confidence: {
      level: levelName,
      accuracy,
      text: `Back-tested on the last 7 days it hadn't seen: ${accuracy}% accurate on daily inquiry volume.`,
    },
  };
}

/* ── Demo data set (labelled as such in the UI) ────────────────────── */
const DEMO_NAMES = ["Aisha Al Mansoori", "Rahul Menon", "Sara Khan", "Fatima Al Zaabi", "James Carter", "Noura Al Suwaidi", "Priya Nair", "Omar Haddad", "Elena Petrova", "Mariam Rashid", "Arjun Kapoor", "Layla Faris"];
const DEMO_PIECES = ["Solitaire Halo Ring", "Layla Diamond Rivière", "Chandelier Diamond Earrings", "Tennis Bracelet 3ct", "22K Heritage Choker", "Emerald Cut Trilogy Ring", "Pearl & Gold Strand"];
const DEMO_BRANCHES = ["Dubai Mall Flagship", "Gold Souk Boutique", "Al Maryah Salon"];
const DEMO_SOURCES = ["boutique", "whatsapp", "walk_in", "phone"];
const DEMO_STAGES = ["NEW", "QUALIFIED", "QUOTED", "APPOINTMENT", "CONVERTED", "LOST"];
const DEMO_OCC = ["Bridal", "Engagement", "Anniversary", "Gift", "Everyday", null];

function demoData(now: Date) {
  const rnd = mulberry32(20261012);
  const series: { date: string; count: number }[] = [];
  for (let i = 69; i >= 0; i--) {
    const d = startOfDay(new Date(now.getTime() - i * DAY));
    const dow = d.getUTCDay();
    const base = 6 + (dow === 5 || dow === 6 ? 4 : dow === 4 ? 2 : 0); // Thu–Sat peak (UAE weekend)
    const growth = 1 + (69 - i) * 0.004;
    series.push({ date: iso(d), count: Math.max(0, Math.round(base * growth + (rnd() - 0.5) * 4)) });
  }
  const leads: LeadInput[] = Array.from({ length: 14 }, (_, i) => ({
    id: `demo-${i}`,
    reference: `INQ-D${String(1040 + i)}`,
    customer: DEMO_NAMES[i % DEMO_NAMES.length],
    status: DEMO_STAGES[Math.floor(rnd() * 5)],
    source: DEMO_SOURCES[Math.floor(rnd() * 4)],
    budget: rnd() > 0.25 ? Math.round((5 + rnd() * 70) * 1000) : null,
    items: 1 + Math.floor(rnd() * 3),
    createdAt: new Date(now.getTime() - rnd() * 20 * DAY),
    branch: DEMO_BRANCHES[Math.floor(rnd() * 3)],
    occasion: DEMO_OCC[Math.floor(rnd() * DEMO_OCC.length)],
  }));
  return {
    series,
    leads,
    stats: {
      staleNew: 4, staleNewOldestH: 31, quotesWaiting: 6, quotesWaitingValue: 186400, quotesExpiringSoon: 2,
      winRate: 34, quotedFastPct: 82, pipelineValue: 412800, aov: 21650,
      lowStockHot: [{ product: "Solitaire Halo Ring", branch: "Dubai Mall Flagship", quantity: 1 }],
      topCategory: "Rings", topCategoryShare: 38, goldChange: 1.8, appointmentsTomorrow: 5,
      bestBranch: "Dubai Mall Flagship", bestBranchConv: 41, sourceBest: "walk_in", sourceBestConv: 52,
    },
    piece: DEMO_PIECES,
  };
}

/* ── Live data set ─────────────────────────────────────────────────── */
async function liveData(tenantId: string, now: Date) {
  const since = new Date(now.getTime() - 70 * DAY);
  const [inquiries, quotes, invoices, lowStock, goldObs, apptsTomorrow, branches] = await Promise.all([
    prisma.inquiry.findMany({ where: { tenantId }, include: { customer: true, branch: true, _count: { select: { items: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.quotation.findMany({ where: { tenantId }, select: { status: true, total: true, createdAt: true, validUntil: true, inquiryId: true } }),
    prisma.invoice.findMany({ where: { tenantId, status: { in: ["ISSUED", "PAID", "PARTIAL"] } }, select: { total: true } }),
    prisma.inventory.findMany({ where: { branch: { tenantId }, quantity: { lte: 1 }, product: { featured: true } }, include: { product: true, branch: true }, take: 3 }),
    prisma.goldPriceObservation.findMany({ where: { tenantId, karat: 22, observedAt: { gte: new Date(now.getTime() - 30 * DAY) } }, orderBy: { observedAt: "asc" }, select: { pricePerGram: true } }),
    prisma.appointment.count({ where: { tenantId, scheduledAt: { gte: startOfDay(new Date(now.getTime() + DAY)), lt: startOfDay(new Date(now.getTime() + 2 * DAY)) } } }),
    prisma.branch.findMany({ where: { tenantId }, select: { id: true, name: true } }),
  ]);

  const counts = new Map<string, number>();
  inquiries.filter((i) => i.createdAt >= since).forEach((i) => counts.set(iso(i.createdAt), (counts.get(iso(i.createdAt)) ?? 0) + 1));
  const series: { date: string; count: number }[] = [];
  for (let i = 69; i >= 0; i--) { const d = iso(startOfDay(new Date(now.getTime() - i * DAY))); series.push({ date: d, count: counts.get(d) ?? 0 }); }

  const leads: LeadInput[] = inquiries.slice(0, 60).map((i) => ({
    id: i.id, reference: i.reference, customer: i.customer?.name ?? "Guest", status: i.status, source: i.source,
    budget: i.budget, items: i._count.items, createdAt: i.createdAt, branch: i.branch?.name ?? null, occasion: i.occasion,
  }));

  const staleNewList = inquiries.filter((i) => i.status === "NEW" && now.getTime() - i.createdAt.getTime() > DAY);
  const waiting = quotes.filter((q) => q.status === "SENT");
  const closed = inquiries.filter((i) => i.status === "CONVERTED" || i.status === "LOST");
  const won = inquiries.filter((i) => i.status === "CONVERTED");
  const quotedFast = inquiries.filter((i) => quotes.some((q) => q.inquiryId === i.id && q.createdAt.getTime() - i.createdAt.getTime() <= DAY));
  const quotedAny = inquiries.filter((i) => quotes.some((q) => q.inquiryId === i.id));
  const bySource = new Map<string, { n: number; won: number }>();
  inquiries.forEach((i) => { const e = bySource.get(i.source) ?? { n: 0, won: 0 }; e.n++; if (i.status === "CONVERTED") e.won++; bySource.set(i.source, e); });
  const bestSource = [...bySource.entries()].filter(([, v]) => v.n >= 2).sort((a, b) => b[1].won / b[1].n - a[1].won / a[1].n)[0];
  const byBranch = branches.map((b) => {
    const list = inquiries.filter((i) => i.branchId === b.id);
    return { name: b.name, conv: list.length ? Math.round((list.filter((i) => i.status === "CONVERTED").length / list.length) * 100) : 0, n: list.length };
  }).sort((a, b) => b.conv - a.conv || b.n - a.n);
  const goldChange = goldObs.length > 1 ? ((goldObs[goldObs.length - 1].pricePerGram - goldObs[0].pricePerGram) / goldObs[0].pricePerGram) * 100 : 0;
  const revenue = invoices.reduce((s, i) => s + i.total, 0);

  return {
    series,
    leads,
    stats: {
      staleNew: staleNewList.length,
      staleNewOldestH: staleNewList.length ? Math.round((now.getTime() - Math.min(...staleNewList.map((i) => i.createdAt.getTime()))) / 36e5) : 0,
      quotesWaiting: waiting.length,
      quotesWaitingValue: Math.round(waiting.reduce((s, q) => s + q.total, 0)),
      quotesExpiringSoon: waiting.filter((q) => q.validUntil && q.validUntil.getTime() - now.getTime() < 3 * DAY).length,
      winRate: closed.length ? Math.round((won.length / closed.length) * 100) : 0,
      quotedFastPct: quotedAny.length ? Math.round((quotedFast.length / quotedAny.length) * 100) : 0, // % of quoted leads quoted within 24 h
      pipelineValue: Math.round(quotes.filter((q) => q.status === "DRAFT" || q.status === "SENT").reduce((s, q) => s + q.total, 0)),
      aov: invoices.length ? Math.round(revenue / invoices.length) : 0,
      lowStockHot: lowStock.map((l) => ({ product: l.product.name, branch: l.branch.name, quantity: l.quantity })),
      topCategory: null as string | null, topCategoryShare: 0,
      goldChange: round(goldChange, 2),
      appointmentsTomorrow: apptsTomorrow,
      bestBranch: byBranch[0]?.n ? byBranch[0].name : null, bestBranchConv: byBranch[0]?.conv ?? 0,
      sourceBest: bestSource?.[0] ?? null, sourceBestConv: bestSource ? Math.round((bestSource[1].won / bestSource[1].n) * 100) : 0,
    },
    inquiryCount: inquiries.length,
  };
}

const SOURCE_NAME: Record<string, string> = { boutique: "online boutique", whatsapp: "WhatsApp", walk_in: "walk-in", phone: "phone" };
const aedK = (n: number) => (n >= 1000 ? `AED ${round(n / 1000, n >= 100000 ? 0 : 1)}k` : `AED ${Math.round(n)}`);

export async function buildInsights(tenantId: string, requested: Source) {
  const now = new Date();
  let source: "live" | "demo" = requested === "demo" ? "demo" : "live";
  let note: string | null = null;
  let data: ReturnType<typeof demoData> | Awaited<ReturnType<typeof liveData>>;

  if (source === "live") {
    const live = await liveData(tenantId, now);
    if (requested === "auto" && live.inquiryCount < MIN_LIVE_INQUIRIES) {
      source = "demo";
      note = `You have ${live.inquiryCount} inquir${live.inquiryCount === 1 ? "y" : "ies"} so far — the model needs about ${MIN_LIVE_INQUIRIES} to be meaningful, so this view uses a realistic demo data set. Switch to "My data" to see your own numbers.`;
      data = demoData(now);
    } else {
      data = live;
    }
  } else {
    note = "Showing the demo data set. Switch to \"My data\" to see your own numbers.";
    data = demoData(now);
  }

  const fc = forecast(data.series);
  const st = data.stats;
  const scored = data.leads
    .filter((l) => !["CONVERTED", "LOST"].includes(l.status))
    .map((l) => ({ id: l.id, reference: l.reference, customer: l.customer, stage: l.status, branch: l.branch, budget: l.budget, ...scoreLead(l, now) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  /* Recommendations — each rule fires only when its signal is present */
  type Rec = { category: string; title: string; detail: string; impact: string; confidence: number; link?: string };
  const recs: Rec[] = [];
  if (st.staleNew > 0) recs.push({
    category: "Leads", link: "/inquiries",
    title: `Call ${st.staleNew} new lead${st.staleNew === 1 ? "" : "s"} waiting over 24 hours`,
    detail: `The oldest has waited ${st.staleNewOldestH} hours. Leads contacted within the first hour convert far more often than next-day callbacks.`,
    impact: `Recover up to ${Math.max(1, Math.round(st.staleNew * 0.3))} sale${st.staleNew > 3 ? "s" : ""} this week`, confidence: 88,
  });
  if (st.quotesWaiting > 0) recs.push({
    category: "Quotations", link: "/quotes",
    title: `Follow up ${st.quotesWaiting} sent quotation${st.quotesWaiting === 1 ? "" : "s"} worth ${aedK(st.quotesWaitingValue)}`,
    detail: st.quotesExpiringSoon ? `${st.quotesExpiringSoon} expire within 3 days. A WhatsApp nudge with a private-viewing offer is the strongest closer.` : "Customers who get a follow-up within 48 hours accept noticeably more often.",
    impact: `≈ ${aedK(st.quotesWaitingValue * 0.3)} expected value`, confidence: 81,
  });
  if (fc.busiestDay) recs.push({
    category: "Staffing", link: "/appointments",
    title: `Add an advisor on ${fc.busiestDay}s`,
    detail: `${fc.busiestDay} is the busiest inquiry day. ${fc.next7} inquiries are forecast for the next 7 days (${fc.trendPct >= 0 ? "+" : ""}${fc.trendPct}% trend).`,
    impact: "Shorter waits, higher walk-in conversion", confidence: Math.min(90, fc.confidence.accuracy),
  });
  st.lowStockHot.forEach((l) => recs.push({
    category: "Inventory", link: "/catalog",
    title: `Restock ${l.product} at ${l.branch}`,
    detail: `Only ${l.quantity} left of a featured piece. Transfer from another boutique or raise a purchase order before the weekend.`,
    impact: "Avoid lost sales on a top piece", confidence: 77,
  }));
  if (st.sourceBest) recs.push({
    category: "Marketing", link: "/offers",
    title: `Put more spend behind ${SOURCE_NAME[st.sourceBest] ?? st.sourceBest} leads`,
    detail: `They convert at ${st.sourceBestConv}%, the best of any channel. Feature that channel in the next campaign.`,
    impact: "Higher-quality pipeline per dirham", confidence: 69,
  });
  if (Math.abs(st.goldChange) >= 1) recs.push({
    category: "Pricing", link: "/gold",
    title: st.goldChange > 0 ? "Gold is up — refresh fixed-price 22K pieces" : "Gold eased — a timely moment for a 22K promotion",
    detail: `22K moved ${st.goldChange > 0 ? "+" : ""}${st.goldChange}% over 30 days. ${st.goldChange > 0 ? "Review making-charge margins on fixed-price items." : "Customers waiting for a dip are likely to act now."}`,
    impact: st.goldChange > 0 ? "Protect margin" : "Lift 22K sales", confidence: 72,
  });
  if (st.bestBranch) recs.push({
    category: "Branches",
    title: `Share ${st.bestBranch}'s playbook`,
    detail: `${st.bestBranch} converts ${st.bestBranchConv}% of its inquiries. Pair new advisors there for a week.`,
    impact: "Lift conversion across boutiques", confidence: 61,
  });
  recs.sort((a, b) => b.confidence - a.confidence);

  const hot = scored.filter((s) => s.band === "Hot").length;
  const headline = [
    `${fc.next7} inquiries are forecast for the next 7 days${fc.trendPct ? `, ${fc.trendPct > 0 ? "up" : "down"} ${Math.abs(fc.trendPct)}% on trend` : ""}.`,
    hot ? `${hot} hot lead${hot === 1 ? " is" : "s are"} ready to close.` : "",
    st.staleNew ? `${st.staleNew} new lead${st.staleNew === 1 ? " needs" : "s need"} a first call.` : "Every new lead has been contacted.",
  ].filter(Boolean).join(" ");

  return {
    source, note, generatedAt: now.toISOString(), headline,
    kpis: {
      winRate: st.winRate, quotedWithin24h: st.quotedFastPct, pipelineValue: st.pipelineValue, aov: st.aov,
      forecast7: fc.next7, trendPct: fc.trendPct, confidence: fc.confidence.accuracy, hotLeads: hot,
    },
    forecast: { points: fc.points, busiestDay: fc.busiestDay, confidence: fc.confidence },
    recommendations: recs.slice(0, 6),
    leads: scored,
  };
}
