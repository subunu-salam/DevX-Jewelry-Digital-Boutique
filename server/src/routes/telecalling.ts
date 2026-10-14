import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireStaff } from "../middleware/auth.js";
import { audit, makeRef } from "../lib/audit.js";
import { buildRecurring } from "../lib/recurring.js";

export const telecallingRouter = Router();
telecallingRouter.use(requireStaff);

export const MANAGER_ROLES = ["PLATFORM_ADMIN", "OWNER", "COMPANY_ADMIN", "BRANCH_MANAGER"];
const isManager = (role?: string | null) => MANAGER_ROLES.includes(role ?? "");
const src = (v: unknown) => (v === "live" || v === "demo" ? v : "auto") as "auto" | "live" | "demo";

/**
 * Offer policy — what a telecaller may give without a manager. Anything above the
 * limit goes to the Approvals queue. Managers' own requests are approved directly.
 */
export const OFFER_TYPES = {
  MAKING_DISCOUNT: { label: "Discount on making charges", unit: "%", autoLimit: 10, max: 50 },
  PRICE_DISCOUNT: { label: "Discount on total price", unit: "%", autoLimit: 3, max: 20 },
  GOLD_RATE_LOCK: { label: "Lock today's gold rate", unit: "days", autoLimit: 3, max: 30 },
  FREE_GIFT: { label: "Complimentary gift", unit: "AED", autoLimit: 250, max: 5000 },
  BONUS_GOLD: { label: "Bonus gold on next purchase", unit: "AED", autoLimit: 0, max: 5000 },
} as const;
type OfferType = keyof typeof OFFER_TYPES;
export const LOST_REASONS = [
  "Travelling / buying in India", "Gold price too high right now", "Bought from another jeweller", "No occasion coming up",
  "Budget / saving up", "Unhappy with service or product", "Wants a design we don't have", "Moved away", "Other",
];

telecallingRouter.get("/config", (_req, res) => res.json({ offerTypes: OFFER_TYPES, lostReasons: LOST_REASONS }));

/* ── Recurring customer leads ── */
telecallingRouter.get("/recurring", async (req, res) => {
  res.json(await buildRecurring(req.principal!.tenantId, src(req.query.source)));
});

/* ── Offers & approvals ── */
telecallingRouter.get("/approvals/count", async (req, res) => {
  const pending = await prisma.offerRequest.count({ where: { tenantId: req.principal!.tenantId, status: "PENDING" } });
  res.json({ pending, canApprove: isManager(req.principal!.role) });
});

telecallingRouter.get("/offers", async (req, res) => {
  const p = req.principal!;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const mine = req.query.mine === "1";
  const rows = await prisma.offerRequest.findMany({
    where: { tenantId: p.tenantId, ...(status ? { status } : {}), ...(mine ? { requestedById: p.sub } : {}) },
    include: { requestedBy: { select: { name: true } }, decidedBy: { select: { name: true } }, callTask: { select: { reason: true, lostReason: true, feedback: true, tier: true, segment: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: 300,
  });
  res.json({ canApprove: isManager(p.role), offers: rows.map((o) => ({ ...o, requestedBy: o.requestedBy?.name ?? null, decidedBy: o.decidedBy?.name ?? null })) });
});

telecallingRouter.post("/offers", async (req, res) => {
  const p = req.principal!;
  const body = z.object({
    callTaskId: z.string().optional(),
    customerId: z.string().optional(),
    customerName: z.string().trim().min(2),
    customerPhone: z.string().trim().optional().nullable(),
    type: z.enum(Object.keys(OFFER_TYPES) as [OfferType, ...OfferType[]]),
    value: z.number().nonnegative(),
    reason: z.string().trim().min(3).max(1000),
    validDays: z.number().int().min(1).max(60).default(14),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Choose an offer, its value and say why." });
  const d = body.data;
  const rule = OFFER_TYPES[d.type];
  if (d.value > rule.max) return res.status(400).json({ error: `${rule.label} can't exceed ${rule.max}${rule.unit === "%" ? "%" : ` ${rule.unit}`}.` });
  const realCustomer = d.customerId ? await prisma.customer.findFirst({ where: { id: d.customerId, tenantId: p.tenantId }, select: { id: true } }) : null;
  const task = d.callTaskId ? await prisma.callTask.findFirst({ where: { id: d.callTaskId, tenantId: p.tenantId }, select: { id: true } }) : null;
  const auto = isManager(p.role) || d.value <= rule.autoLimit;
  const offer = await prisma.offerRequest.create({
    data: {
      tenantId: p.tenantId, reference: makeRef("OFR"), callTaskId: task?.id ?? null, customerId: realCustomer?.id ?? null,
      customerName: d.customerName, customerPhone: d.customerPhone ?? null, type: d.type, value: d.value, reason: d.reason,
      status: auto ? "APPROVED" : "PENDING", autoApproved: auto, requestedById: p.sub,
      decidedById: auto ? p.sub : null, decidedAt: auto ? new Date() : null,
      decisionNote: auto ? (isManager(p.role) ? "Approved by manager" : "Within telecaller limit — auto-approved") : null,
      validUntil: new Date(Date.now() + d.validDays * 864e5), code: auto ? offerCode() : null,
    },
  });
  await audit({ tenantId: p.tenantId, userId: p.sub, action: auto ? "offer.auto_approve" : "offer.request", entity: "OfferRequest", entityId: offer.id, meta: { type: d.type, value: d.value } });
  res.status(201).json(offer);
});

telecallingRouter.patch("/offers/:id/decide", async (req, res) => {
  const p = req.principal!;
  if (!isManager(p.role)) return res.status(403).json({ error: "Only a manager can approve or reject offers." });
  const body = z.object({ decision: z.enum(["APPROVE", "REJECT"]), note: z.string().max(500).optional(), value: z.number().nonnegative().optional() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid decision" });
  const o = await prisma.offerRequest.findFirst({ where: { id: req.params.id, tenantId: p.tenantId } });
  if (!o) return res.status(404).json({ error: "Not found" });
  if (o.status !== "PENDING") return res.status(409).json({ error: `Already ${o.status.toLowerCase()}` });
  const approve = body.data.decision === "APPROVE";
  const updated = await prisma.offerRequest.update({
    where: { id: o.id },
    data: {
      status: approve ? "APPROVED" : "REJECTED", decidedById: p.sub, decidedAt: new Date(), decisionNote: body.data.note ?? null,
      value: approve && body.data.value !== undefined ? body.data.value : undefined, // manager may approve a lower value
      code: approve ? offerCode() : null,
    },
  });
  await audit({ tenantId: p.tenantId, userId: p.sub, action: approve ? "offer.approve" : "offer.reject", entity: "OfferRequest", entityId: o.id, meta: body.data });
  res.json(updated);
});

telecallingRouter.patch("/offers/:id/redeem", async (req, res) => {
  const p = req.principal!;
  const body = z.object({ amount: z.number().positive() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Enter the sale amount." });
  const o = await prisma.offerRequest.findFirst({ where: { id: req.params.id, tenantId: p.tenantId } });
  if (!o) return res.status(404).json({ error: "Not found" });
  if (o.status !== "APPROVED") return res.status(409).json({ error: "Only approved offers can be redeemed." });
  const updated = await prisma.offerRequest.update({ where: { id: o.id }, data: { status: "REDEEMED", redeemedAt: new Date(), redeemedAmount: body.data.amount } });
  await audit({ tenantId: p.tenantId, userId: p.sub, action: "offer.redeem", entity: "OfferRequest", entityId: o.id, meta: body.data });
  res.json(updated);
});

function offerCode() {
  return "AUR-" + Math.random().toString(36).slice(2, 6).toUpperCase() + Math.floor(10 + Math.random() * 89);
}

/* ── Performance: business converted by telecalling ── */
telecallingRouter.get("/performance", async (req, res) => {
  const p = req.principal!;
  const days = [30, 60, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const since = new Date(Date.now() - days * 864e5);
  const [tasks, offers, users] = await Promise.all([
    prisma.callTask.findMany({ where: { tenantId: p.tenantId, createdAt: { gte: since } }, select: { id: true, customerId: true, assignedToId: true, status: true, outcome: true, lostReason: true, segment: true, completedAt: true, attempts: true } }),
    prisma.offerRequest.findMany({ where: { tenantId: p.tenantId, createdAt: { gte: since } }, select: { status: true, redeemedAmount: true, requestedById: true, type: true, value: true, callTaskId: true } }),
    prisma.user.findMany({ where: { tenantId: p.tenantId }, select: { id: true, name: true } }),
  ]);
  const source = src(req.query.source);
  if (source === "demo" || (source === "auto" && tasks.filter((t) => t.status === "DONE").length < 5)) {
    return res.json({ ...demoPerformance(days), note: source === "auto" ? "Fewer than 5 completed calls in this period — showing a sample. Real numbers build up as the team logs calls." : null });
  }

  // Revenue converted: redeemed offers + invoices from called (reached) customers within 30 days of the call.
  const reachedCustomers = tasks.filter((t) => t.customerId && t.completedAt && (t.outcome === "REACHED" || t.outcome === "VISIT_BOOKED"));
  const invoices = reachedCustomers.length ? await prisma.invoice.findMany({
    where: { tenantId: p.tenantId, customerId: { in: reachedCustomers.map((t) => t.customerId!) }, status: { in: ["ISSUED", "PAID", "PARTIAL"] }, createdAt: { gte: since } },
    select: { customerId: true, total: true, createdAt: true },
  }) : [];
  const convertedBy = new Map<string, number>(); // taskId → revenue
  for (const t of reachedCustomers) {
    const rev = invoices.filter((i) => i.customerId === t.customerId && +i.createdAt >= +t.completedAt! && +i.createdAt - +t.completedAt! <= 30 * 864e5).reduce((s, i) => s + i.total, 0);
    if (rev) convertedBy.set(t.id, rev);
  }
  const offerRev = offers.filter((o) => o.status === "REDEEMED" && !(o.callTaskId && convertedBy.has(o.callTaskId))).reduce((s, o) => s + (o.redeemedAmount ?? 0), 0);
  const revenue = [...convertedBy.values()].reduce((s, v) => s + v, 0) + offerRev;
  const done = tasks.filter((t) => t.status === "DONE");
  const reached = done.filter((t) => t.outcome === "REACHED" || t.outcome === "VISIT_BOOKED");
  const converted = new Set([...convertedBy.keys(), ...offers.filter((o) => o.status === "REDEEMED" && o.callTaskId).map((o) => o.callTaskId!)]);

  const name = (id: string | null) => users.find((u) => u.id === id)?.name ?? "Unassigned";
  const agents = [...new Set(tasks.map((t) => t.assignedToId))].map((id) => {
    const mineT = tasks.filter((t) => t.assignedToId === id), mineD = mineT.filter((t) => t.status === "DONE");
    const mineO = offers.filter((o) => o.requestedById === id);
    return {
      name: name(id), calls: mineT.reduce((s, t) => s + Math.max(1, t.attempts), 0), closed: mineD.length,
      reached: mineD.filter((t) => t.outcome === "REACHED" || t.outcome === "VISIT_BOOKED").length,
      visits: mineD.filter((t) => t.outcome === "VISIT_BOOKED").length,
      offers: mineO.length, converted: mineT.filter((t) => converted.has(t.id)).length,
      revenue: Math.round(mineT.reduce((s, t) => s + (convertedBy.get(t.id) ?? 0), 0) + mineO.filter((o) => o.status === "REDEEMED" && !(o.callTaskId && convertedBy.has(o.callTaskId))).reduce((s, o) => s + (o.redeemedAmount ?? 0), 0)),
    };
  }).sort((a, b) => b.revenue - a.revenue);
  const segs = ["ONE_TIME", "SECOND_TIME", "RECURRING", "CONTINUOUS"].map((s) => {
    const st = tasks.filter((t) => t.segment === s);
    return { segment: s, calls: st.length, converted: st.filter((t) => converted.has(t.id)).length, revenue: Math.round(st.reduce((a, t) => a + (convertedBy.get(t.id) ?? 0), 0)) };
  });
  const reasons = LOST_REASONS.map((r) => ({ reason: r, count: done.filter((t) => t.lostReason === r).length })).filter((r) => r.count).sort((a, b) => b.count - a.count);

  res.json({
    source: "live", note: null, days,
    kpis: {
      calls: tasks.reduce((s, t) => s + Math.max(1, t.attempts), 0), closed: done.length,
      reachRate: done.length ? Math.round((reached.length / done.length) * 100) : 0,
      visits: done.filter((t) => t.outcome === "VISIT_BOOKED").length,
      offersRequested: offers.length, offersApproved: offers.filter((o) => ["APPROVED", "REDEEMED"].includes(o.status)).length,
      offersRedeemed: offers.filter((o) => o.status === "REDEEMED").length,
      converted: converted.size, conversionRate: done.length ? Math.round((converted.size / done.length) * 100) : 0,
      revenue: Math.round(revenue),
    },
    agents, segments: segs, reasons,
  });
});

function demoPerformance(days: number) {
  const k = days / 30;
  const agents = [
    { name: "Sara Thomas", calls: 148, closed: 112, reached: 79, visits: 21, offers: 18, converted: 16, revenue: 214500 },
    { name: "Omar Khalid", calls: 131, closed: 97, reached: 61, visits: 15, offers: 14, converted: 11, revenue: 152800 },
    { name: "Priya Nair", calls: 102, closed: 81, reached: 55, visits: 12, offers: 9, converted: 9, revenue: 118300 },
    { name: "Daniel Cruz", calls: 76, closed: 58, reached: 33, visits: 6, offers: 7, converted: 4, revenue: 46200 },
  ].map((a) => Object.fromEntries(Object.entries(a).map(([key, v]) => [key, typeof v === "number" ? Math.round(v * k) : v])));
  const sum = (key: string) => agents.reduce((s, a) => s + (a[key] as number), 0);
  const closed = sum("closed"), converted = sum("converted");
  return {
    source: "demo", days,
    kpis: {
      calls: sum("calls"), closed, reachRate: Math.round((sum("reached") / closed) * 100), visits: sum("visits"),
      offersRequested: sum("offers"), offersApproved: Math.round(sum("offers") * 0.83), offersRedeemed: Math.round(sum("offers") * 0.58),
      converted, conversionRate: Math.round((converted / closed) * 100), revenue: sum("revenue"),
    },
    agents,
    segments: [
      { segment: "ONE_TIME", calls: Math.round(118 * k), converted: Math.round(7 * k), revenue: Math.round(61000 * k) },
      { segment: "SECOND_TIME", calls: Math.round(96 * k), converted: Math.round(10 * k), revenue: Math.round(97500 * k) },
      { segment: "RECURRING", calls: Math.round(141 * k), converted: Math.round(15 * k), revenue: Math.round(208400 * k) },
      { segment: "CONTINUOUS", calls: Math.round(73 * k), converted: Math.round(8 * k), revenue: Math.round(164900 * k) },
    ],
    reasons: [
      { reason: "Travelling / buying in India", count: Math.round(34 * k) }, { reason: "Gold price too high right now", count: Math.round(29 * k) },
      { reason: "No occasion coming up", count: Math.round(22 * k) }, { reason: "Budget / saving up", count: Math.round(17 * k) },
      { reason: "Bought from another jeweller", count: Math.round(11 * k) }, { reason: "Wants a design we don't have", count: Math.round(7 * k) },
      { reason: "Unhappy with service or product", count: Math.round(4 * k) },
    ],
  };
}
