import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireStaff } from "../middleware/auth.js";
import { audit } from "../lib/audit.js";
import { buildRetention, TIERS } from "../lib/retention.js";
import { buildMarketing } from "../lib/marketing.js";

export const retentionRouter = Router();
retentionRouter.use(requireStaff);

const src = (v: unknown) => (v === "live" || v === "demo" ? v : "auto") as "auto" | "live" | "demo";

/* ── Loyalty tiers + churn alerts ── */
retentionRouter.get("/", async (req, res) => {
  res.json(await buildRetention(req.principal!.tenantId, src(req.query.source)));
});
retentionRouter.get("/tiers", (_req, res) => res.json(TIERS));

/* Log an automated campaign touch (win-back / reminder) for audit + reporting */
retentionRouter.post("/campaign", async (req, res) => {
  const p = req.principal!;
  const body = z.object({
    kind: z.enum(["WINBACK_CAMPAIGN", "REMINDER_CAMPAIGN"]),
    channel: z.enum(["whatsapp", "email", "sms"]).default("whatsapp"),
    clients: z.array(z.object({ id: z.string(), name: z.string() })).min(1).max(500),
    message: z.string().max(1000).optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Pick at least one client." });
  await audit({ tenantId: p.tenantId, userId: p.sub, action: "retention.campaign", entity: "Campaign", meta: { kind: body.data.kind, channel: body.data.channel, count: body.data.clients.length, clients: body.data.clients.map((c) => c.id) } });
  res.status(201).json({ queued: body.data.clients.length });
});

/* ── Telecalling queue ── */
const taskIn = z.object({
  customerId: z.string().optional(),
  customerName: z.string().trim().min(2),
  customerPhone: z.string().trim().optional().nullable(),
  reason: z.string().trim().min(2).max(500),
  tier: z.string().optional().nullable(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  source: z.enum(["churn", "recurring", "lead", "manual"]).default("manual"),
  segment: z.enum(["ONE_TIME", "SECOND_TIME", "RECURRING", "CONTINUOUS"]).optional().nullable(),
  dueAt: z.string().optional(),
  assignedToId: z.string().optional().nullable(),
  notes: z.string().optional(),
});

async function createTasks(tenantId: string, userId: string, items: z.infer<typeof taskIn>[]) {
  // Skip clients who already have an open call.
  const open = await prisma.callTask.findMany({ where: { tenantId, status: "OPEN" }, select: { customerId: true, customerName: true } });
  const has = (t: z.infer<typeof taskIn>) => open.some((o) => (t.customerId && !t.customerId.startsWith("demo-") ? o.customerId === t.customerId : o.customerName === t.customerName));
  const fresh = items.filter((t) => !has(t));
  // Demo clients (ids like "demo-12") have no customer row.
  const realIds = new Set((await prisma.customer.findMany({ where: { tenantId, id: { in: fresh.map((t) => t.customerId ?? "").filter(Boolean) } }, select: { id: true } })).map((c) => c.id));
  await prisma.callTask.createMany({
    data: fresh.map((t) => ({
      tenantId, customerId: t.customerId && realIds.has(t.customerId) ? t.customerId : null,
      customerName: t.customerName, customerPhone: t.customerPhone ?? null, reason: t.reason, tier: t.tier ?? null,
      priority: t.priority, source: t.source, notes: t.notes ?? null, segment: t.segment ?? null,
      dueAt: t.dueAt ? new Date(t.dueAt) : new Date(), assignedToId: t.assignedToId || null,
    })),
  });
  await audit({ tenantId, userId, action: "calls.create", entity: "CallTask", meta: { count: fresh.length, skipped: items.length - fresh.length } });
  return { created: fresh.length, skipped: items.length - fresh.length };
}

retentionRouter.post("/calls", async (req, res) => {
  const body = z.union([taskIn, z.object({ items: z.array(taskIn).min(1).max(300) })]).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Customer name and a reason are required." });
  const items = "items" in body.data ? body.data.items : [body.data];
  res.status(201).json(await createTasks(req.principal!.tenantId, req.principal!.sub, items));
});

retentionRouter.get("/calls", async (req, res) => {
  const p = req.principal!;
  const mine = req.query.mine === "1";
  const tasks = await prisma.callTask.findMany({
    where: { tenantId: p.tenantId, ...(mine ? { assignedToId: p.sub } : {}), OR: [{ status: "OPEN" }, { completedAt: { gte: new Date(Date.now() - 14 * 864e5) } }] },
    include: { assignedTo: { select: { id: true, name: true } }, customer: { select: { id: true, email: true } } },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    take: 500,
  });
  res.json(tasks.map((t) => ({ ...t, assignedTo: t.assignedTo?.name ?? null })));
});

retentionRouter.patch("/calls/:id", async (req, res) => {
  const p = req.principal!;
  const body = z.object({
    outcome: z.enum(["REACHED", "NO_ANSWER", "CALLBACK", "VISIT_BOOKED", "NOT_INTERESTED", "WRONG_NUMBER"]).optional(),
    notes: z.string().max(2000).optional(),
    nextAt: z.string().optional(),
    assignedToId: z.string().nullable().optional(),
    priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
    lostReason: z.string().max(120).optional().nullable(),
    feedback: z.string().max(2000).optional().nullable(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid update" });
  const t = await prisma.callTask.findFirst({ where: { id: req.params.id, tenantId: p.tenantId } });
  if (!t) return res.status(404).json({ error: "Not found" });
  const d = body.data;
  const retry = d.outcome === "NO_ANSWER" || d.outcome === "CALLBACK";
  const stamp = d.outcome ? `[${new Date().toISOString().slice(0, 16).replace("T", " ")}] ${d.outcome.replace("_", " ").toLowerCase()}${d.notes ? ` — ${d.notes}` : ""}` : null;
  const updated = await prisma.callTask.update({
    where: { id: t.id },
    data: {
      outcome: d.outcome ?? undefined,
      attempts: d.outcome ? { increment: 1 } : undefined,
      notes: stamp ? [t.notes, stamp].filter(Boolean).join("\n") : d.notes ?? undefined,
      status: d.outcome ? (retry ? "OPEN" : "DONE") : undefined,
      completedAt: d.outcome && !retry ? new Date() : undefined,
      dueAt: retry ? (d.nextAt ? new Date(d.nextAt) : new Date(Date.now() + (d.outcome === "NO_ANSWER" ? 4 * 36e5 : 864e5))) : undefined,
      assignedToId: d.assignedToId === undefined ? undefined : d.assignedToId,
      priority: d.priority,
      lostReason: d.lostReason === undefined ? undefined : d.lostReason,
      feedback: d.feedback === undefined ? undefined : d.feedback,
    },
  });
  await audit({ tenantId: p.tenantId, userId: p.sub, action: "calls.update", entity: "CallTask", entityId: t.id, meta: d });
  res.json(updated);
});

/* ── Marketing analytics (Instagram / Meta ads) ── */
retentionRouter.get("/marketing", async (req, res) => {
  const days = [7, 14, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  res.json(await buildMarketing(req.principal!.tenantId, src(req.query.source), days));
});
