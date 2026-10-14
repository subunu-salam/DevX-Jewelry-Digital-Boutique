import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, optionalAuth, requireStaff } from "../middleware/auth.js";
import { audit, makeRef } from "../lib/audit.js";

/**
 * Gold savings plans — value-driven alternative to loyalty points (inspired by
 * Tanishq's Golden Harvest / Gold Harvest schemes):
 *
 *  • INSTALMENT ("Aurelia Golden Harvest") — pay a fixed amount monthly for 11 months;
 *    at maturity the boutique adds a bonus of `bonusPct`% of one instalment, and the
 *    whole balance is redeemed against jewellery.
 *  • ACCUMULATION ("Aurelia Gold Reserve") — each payment buys gold grams at the day's
 *    rate, protecting the client from price rises; at maturity the grams are redeemed as
 *    jewellery with `bonusPct`% off making charges.
 *
 * Unlike points, the boutique's cost is a known, capped bonus paid only on redemption
 * (a sale), and clients commit to a monthly visit/payment — a natural retention loop.
 */

const DAY = 864e5;
const MONTH = 30.44 * DAY;

async function goldRate(tenantId: string, karat: number) {
  const row = await prisma.goldPriceObservation.findFirst({ where: { tenantId, karat }, orderBy: { observedAt: "desc" } });
  if (row) return row.pricePerGram;
  const k24 = await prisma.goldPriceObservation.findFirst({ where: { tenantId, karat: 24 }, orderBy: { observedAt: "desc" } });
  return k24 ? +(k24.pricePerGram * (karat / 24)).toFixed(2) : karat === 24 ? 340 : 312;
}

type PlanRow = {
  id: string; reference: string; type: string; status: string; monthlyAmount: number; tenureMonths: number; bonusPct: number; karat: number;
  startDate: Date; maturityDate: Date; nominee: string | null; notes: string | null;
  customer: { id: string; name: string; phone: string | null };
  payments: { id: string; amount: number; goldRate: number; grams: number; method: string; paidAt: Date }[];
};

function summarise(p: PlanRow, rate: number, now = new Date()) {
  const paid = p.payments.reduce((s, x) => s + x.amount, 0);
  const grams = +p.payments.reduce((s, x) => s + x.grams, 0).toFixed(3);
  const elapsed = Math.floor((now.getTime() - p.startDate.getTime()) / MONTH);
  const due = Math.min(p.tenureMonths, elapsed + 1);
  const missed = p.status === "ACTIVE" ? Math.max(0, due - p.payments.length) : 0;
  const bonus = p.type === "INSTALMENT" ? Math.round((p.monthlyAmount * p.bonusPct) / 100) : 0;
  const currentValue = p.type === "ACCUMULATION" ? Math.round(grams * rate) : paid;
  const maturityValue = p.type === "INSTALMENT" ? p.monthlyAmount * p.tenureMonths + bonus : null;
  const nextDue = p.payments.length < p.tenureMonths ? new Date(p.startDate.getTime() + p.payments.length * MONTH).toISOString() : null;
  const avgRate = grams ? +(paid / grams).toFixed(2) : null;
  return {
    id: p.id, reference: p.reference, type: p.type, status: p.status, karat: p.karat,
    monthlyAmount: p.monthlyAmount, tenureMonths: p.tenureMonths, bonusPct: p.bonusPct,
    startDate: p.startDate.toISOString(), maturityDate: p.maturityDate.toISOString(), nominee: p.nominee, notes: p.notes,
    customer: p.customer, instalmentsPaid: p.payments.length, paid: Math.round(paid), grams, avgRate,
    currentValue, gain: p.type === "ACCUMULATION" ? Math.round(currentValue - paid) : bonus, bonus, maturityValue,
    missed, nextDue, matured: now >= p.maturityDate || p.payments.length >= p.tenureMonths,
    payments: p.payments.map((x) => ({ ...x, paidAt: x.paidAt.toISOString() })).sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
  };
}

/* ───────────── Demo book (shown until the first real plan exists) ───────────── */
function demoPlans(rate: number, now = new Date()): PlanRow[] {
  const people = [
    ["Fatima Al Mansoori", "+971 50 214 8830", "INSTALMENT", 2000, 7, 0], ["Rahul Menon", "+971 55 410 2291", "ACCUMULATION", 1500, 4, 0],
    ["Aisha Rahman", "+971 52 663 1180", "INSTALMENT", 1000, 10, 0], ["Priya Nair", "+971 56 908 4412", "ACCUMULATION", 3000, 9, 1],
    ["Omar Haddad", "+971 50 377 9021", "INSTALMENT", 5000, 3, 0], ["Meera Iyer", "+971 58 120 6634", "INSTALMENT", 1500, 11, 0],
    ["Noura Saeed", "+971 54 771 3308", "ACCUMULATION", 2500, 6, 2], ["Daniel Cruz", "+971 55 230 7781", "INSTALMENT", 750, 5, 1],
    ["Hessa Al Falasi", "+971 50 998 1456", "ACCUMULATION", 10000, 2, 0], ["Ananya Kapoor", "+971 52 345 0098", "INSTALMENT", 2500, 8, 0],
  ] as const;
  return people.map(([name, phone, type, amt, months, missed], i) => {
    const start = new Date(now.getTime() - (months + missed - 0.4) * MONTH);
    const payments = Array.from({ length: months }, (_, k) => {
      const r = rate * (0.9 + (k / 11) * 0.12 + ((i * 7 + k * 3) % 5) * 0.004); // gold drifted up over the year
      return { id: `dp${i}-${k}`, amount: amt, goldRate: +r.toFixed(2), grams: +(amt / r).toFixed(3), method: k % 3 ? "CARD" : "CASH", paidAt: new Date(start.getTime() + k * MONTH + 2 * DAY) };
    });
    return {
      id: `demo-plan-${i + 1}`, reference: `GHP-${(1040 + i).toString(36).toUpperCase()}`, type, status: months >= 11 ? "MATURED" : "ACTIVE",
      monthlyAmount: amt, tenureMonths: 11, bonusPct: type === "INSTALMENT" ? 75 : 50, karat: 22, startDate: start,
      maturityDate: new Date(start.getTime() + 11 * MONTH), nominee: null, notes: null,
      customer: { id: `demo-c-${i}`, name, phone }, payments,
    };
  });
}

/* ───────────── CRM (staff) ───────────── */
export const goldPlansRouter = Router();
goldPlansRouter.use(requireStaff);

goldPlansRouter.get("/", async (req, res) => {
  const p = req.principal!;
  const now = new Date();
  const rate = await goldRate(p.tenantId, 22);
  const rows = await prisma.goldPlan.findMany({
    where: { tenantId: p.tenantId }, orderBy: { createdAt: "desc" },
    include: { customer: { select: { id: true, name: true, phone: true } }, payments: true },
  });
  const wantDemo = req.query.source === "demo" || (req.query.source !== "live" && rows.length === 0);
  const book: PlanRow[] = wantDemo ? demoPlans(rate, now) : rows;
  const plans = book.map((r) => summarise(r, rate, now));
  const active = plans.filter((x) => x.status === "ACTIVE");
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  res.json({
    source: wantDemo ? "demo" : "live",
    note: wantDemo && req.query.source !== "demo" ? "No plans enrolled yet — showing a sample book. Enrol the first client to switch to your own data." : null,
    rate, karat: 22,
    kpis: {
      active: active.length,
      monthlyCommitted: Math.round(active.reduce((s, x) => s + x.monthlyAmount, 0)),
      collected: plans.reduce((s, x) => s + x.paid, 0),
      collectedThisMonth: Math.round(plans.flatMap((x) => x.payments).filter((x) => new Date(x.paidAt) >= monthStart).reduce((s, x) => s + x.amount, 0)),
      gramsHeld: +plans.filter((x) => x.type === "ACCUMULATION" && x.status !== "REDEEMED").reduce((s, x) => s + x.grams, 0).toFixed(1),
      maturing30: active.filter((x) => +new Date(x.maturityDate) - +now <= 30 * DAY).length,
      missed: active.filter((x) => x.missed > 0).length,
      bonusLiability: Math.round(active.reduce((s, x) => s + x.bonus, 0)),
    },
    plans,
  });
});

const enrolSchema = z.object({
  customerId: z.string().optional(),
  name: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  type: z.enum(["INSTALMENT", "ACCUMULATION"]),
  monthlyAmount: z.number().min(250).max(500000),
  tenureMonths: z.number().int().min(6).max(24).default(11),
  karat: z.number().int().refine((k) => [18, 21, 22, 24].includes(k)).default(22),
  bonusPct: z.number().min(0).max(100).optional(),
  nominee: z.string().max(120).optional(),
  firstPayment: z.boolean().default(true),
  method: z.enum(["CASH", "CARD", "TRANSFER", "ONLINE"]).default("CARD"),
});

goldPlansRouter.post("/", async (req, res) => {
  const p = req.principal!;
  const body = enrolSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Check the plan details — minimum AED 250 a month." });
  const d = body.data;
  let customerId = d.customerId;
  if (customerId && !(await prisma.customer.findFirst({ where: { id: customerId, tenantId: p.tenantId } }))) customerId = undefined;
  if (!customerId) {
    if (!d.name || d.name.length < 2 || !d.phone || d.phone.replace(/\D/g, "").length < 6) return res.status(400).json({ error: "Pick a customer or enter a name and phone." });
    const ex = await prisma.customer.findFirst({ where: { tenantId: p.tenantId, phone: d.phone } });
    customerId = (ex ?? (await prisma.customer.create({ data: { tenantId: p.tenantId, name: d.name, phone: d.phone } }))).id;
  }
  const start = new Date();
  const plan = await prisma.goldPlan.create({
    data: {
      tenantId: p.tenantId, reference: makeRef("GHP"), customerId, type: d.type, monthlyAmount: d.monthlyAmount, tenureMonths: d.tenureMonths,
      bonusPct: d.bonusPct ?? (d.type === "INSTALMENT" ? 75 : 50), karat: d.karat, startDate: start,
      maturityDate: new Date(start.getTime() + d.tenureMonths * MONTH), nominee: d.nominee || null, createdById: p.sub,
    },
  });
  if (d.firstPayment) {
    const rate = await goldRate(p.tenantId, d.karat);
    await prisma.goldPlanPayment.create({ data: { planId: plan.id, amount: d.monthlyAmount, goldRate: rate, grams: +(d.monthlyAmount / rate).toFixed(3), method: d.method } });
  }
  await audit({ tenantId: p.tenantId, userId: p.sub, action: "goldplan.enrol", entity: "GoldPlan", entityId: plan.id, meta: { type: d.type, monthly: d.monthlyAmount } });
  res.status(201).json({ id: plan.id, reference: plan.reference });
});

goldPlansRouter.post("/:id/payments", async (req, res) => {
  const p = req.principal!;
  const body = z.object({ amount: z.number().positive().optional(), method: z.enum(["CASH", "CARD", "TRANSFER", "ONLINE"]).default("CARD") }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid payment" });
  const plan = await prisma.goldPlan.findFirst({ where: { id: req.params.id, tenantId: p.tenantId }, include: { payments: { select: { id: true } } } });
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  if (plan.status !== "ACTIVE") return res.status(409).json({ error: "This plan is no longer active." });
  if (plan.payments.length >= plan.tenureMonths) return res.status(409).json({ error: "All instalments are already paid — the plan is ready to redeem." });
  const amount = body.data.amount ?? plan.monthlyAmount;
  const rate = await goldRate(p.tenantId, plan.karat);
  const pay = await prisma.goldPlanPayment.create({ data: { planId: plan.id, amount, goldRate: rate, grams: +(amount / rate).toFixed(3), method: body.data.method } });
  if (plan.payments.length + 1 >= plan.tenureMonths) await prisma.goldPlan.update({ where: { id: plan.id }, data: { status: "MATURED" } });
  await audit({ tenantId: p.tenantId, userId: p.sub, action: "goldplan.payment", entity: "GoldPlan", entityId: plan.id, meta: { amount } });
  res.status(201).json(pay);
});

goldPlansRouter.patch("/:id", async (req, res) => {
  const p = req.principal!;
  const body = z.object({ status: z.enum(["REDEEMED", "CLOSED", "ACTIVE"]), notes: z.string().max(1000).optional() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid update" });
  const plan = await prisma.goldPlan.findFirst({ where: { id: req.params.id, tenantId: p.tenantId } });
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  const updated = await prisma.goldPlan.update({ where: { id: plan.id }, data: { status: body.data.status, notes: body.data.notes ?? plan.notes } });
  await audit({ tenantId: p.tenantId, userId: p.sub, action: `goldplan.${body.data.status.toLowerCase()}`, entity: "GoldPlan", entityId: plan.id });
  res.json(updated);
});

/* ───────────── Customer app (public) ───────────── */
export const goldPublicRouter = Router();

goldPublicRouter.get("/rate", async (_req, res) => {
  const t = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  res.json({ karat: 22, rate: t ? await goldRate(t.id, 22) : 312 });
});

goldPublicRouter.get("/mine", authenticate, async (req, res) => {
  const p = req.principal!;
  if (p.type !== "customer") return res.status(403).json({ error: "Customers only" });
  const rows = await prisma.goldPlan.findMany({ where: { tenantId: p.tenantId, customerId: p.sub }, include: { customer: { select: { id: true, name: true, phone: true } }, payments: true }, orderBy: { createdAt: "desc" } });
  const rate = await goldRate(p.tenantId, 22);
  res.json({ rate, plans: rows.map((r) => summarise(r, rate)) });
});

/** "I'm interested" from the app → a lead in the CRM for the team to enrol. */
goldPublicRouter.post("/interest", optionalAuth, async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(2).optional(), phone: z.string().trim().min(6).optional(),
    type: z.enum(["INSTALMENT", "ACCUMULATION"]), monthlyAmount: z.number().min(250).max(500000),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Please enter your name, phone and monthly amount." });
  const t = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!t) return res.status(500).json({ error: "Not configured" });
  const d = body.data;
  let customerId = req.principal?.type === "customer" ? req.principal.sub : undefined;
  if (!customerId) {
    if (!d.name || !d.phone) return res.status(400).json({ error: "Please enter your name and phone." });
    const ex = await prisma.customer.findFirst({ where: { tenantId: t.id, phone: d.phone } });
    customerId = (ex ?? (await prisma.customer.create({ data: { tenantId: t.id, name: d.name, phone: d.phone } }))).id;
  }
  const label = d.type === "INSTALMENT" ? "Golden Harvest (11-month plan)" : "Gold Reserve (gold accumulation)";
  const inq = await prisma.inquiry.create({
    data: {
      tenantId: t.id, reference: makeRef("INQ"), customerId, source: "boutique", occasion: "Gold savings plan", budget: d.monthlyAmount,
      notes: `Wants to join ${label} at AED ${d.monthlyAmount.toLocaleString()}/month.`,
      items: { create: [{ productName: label, quantity: 1 }] },
    },
  });
  await audit({ tenantId: t.id, action: "goldplan.interest", entity: "Inquiry", entityId: inq.id });
  res.status(201).json({ reference: inq.reference });
});
