import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireStaff, requireRole } from "../middleware/auth.js";
import { hashPassword } from "../lib/auth.js";
import { audit } from "../lib/audit.js";

export const adminRouter = Router();
adminRouter.use(requireStaff);

/* ─────────────── Dashboard ─────────────── */
adminRouter.get("/dashboard", async (req, res) => {
  const p = req.principal!;
  const t = p.tenantId;
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 864e5);

  const [
    productCount,
    activeProducts,
    inquiryCount,
    newInquiries,
    convertedInquiries,
    appointmentCount,
    customerCount,
    invoices,
    branches,
    lowStock,
    latestGold,
    recentInquiries,
  ] = await Promise.all([
    prisma.product.count({ where: { tenantId: t } }),
    prisma.product.count({ where: { tenantId: t, active: true } }),
    prisma.inquiry.count({ where: { tenantId: t } }),
    prisma.inquiry.count({ where: { tenantId: t, status: "NEW" } }),
    prisma.inquiry.count({ where: { tenantId: t, status: "CONVERTED" } }),
    prisma.appointment.count({ where: { tenantId: t, scheduledAt: { gte: now } } }),
    prisma.customer.count({ where: { tenantId: t } }),
    prisma.invoice.findMany({ where: { tenantId: t, status: { in: ["ISSUED", "PAID", "PARTIAL"] } }, select: { total: true, createdAt: true, branchId: true } }),
    prisma.branch.findMany({ where: { tenantId: t }, orderBy: { name: "asc" } }),
    prisma.inventory.findMany({ where: { branch: { tenantId: t }, quantity: { lte: 2 } }, include: { product: true, branch: true }, take: 8 }),
    prisma.goldPriceObservation.findFirst({ where: { tenantId: t, karat: 22 }, orderBy: { observedAt: "desc" } }),
    prisma.inquiry.findMany({ where: { tenantId: t }, orderBy: { createdAt: "desc" }, take: 6, include: { customer: true, branch: true } }),
  ]);

  const revenue = invoices.reduce((s, i) => s + i.total, 0);
  const revenueMonth = invoices.filter((i) => i.createdAt >= monthAgo).reduce((s, i) => s + i.total, 0);
  const conversion = inquiryCount ? Math.round((convertedInquiries / inquiryCount) * 100) : 0;

  // Branch comparison
  const branchStats = await Promise.all(
    branches.map(async (b) => {
      const [inq, rev] = await Promise.all([
        prisma.inquiry.count({ where: { tenantId: t, branchId: b.id } }),
        prisma.invoice.aggregate({ where: { tenantId: t, branchId: b.id, status: { in: ["ISSUED", "PAID", "PARTIAL"] } }, _sum: { total: true } }),
      ]);
      return { branch: b.name, inquiries: inq, revenue: rev._sum.total ?? 0 };
    }),
  );

  // Revenue trend (last 6 months)
  const trend: { month: string; revenue: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const rev = invoices.filter((inv) => inv.createdAt >= start && inv.createdAt < end).reduce((s, inv) => s + inv.total, 0);
    trend.push({ month: start.toLocaleString("en", { month: "short" }), revenue: Math.round(rev) });
  }

  res.json({
    kpis: {
      revenue: Math.round(revenue),
      revenueMonth: Math.round(revenueMonth),
      products: activeProducts,
      totalProducts: productCount,
      inquiries: inquiryCount,
      newInquiries,
      conversion,
      appointments: appointmentCount,
      customers: customerCount,
      goldRate22k: latestGold?.pricePerGram ?? null,
    },
    branchStats,
    trend,
    lowStock: lowStock.map((l) => ({ product: l.product.name, branch: l.branch.name, quantity: l.quantity })),
    recentInquiries: recentInquiries.map((i) => ({
      id: i.id,
      reference: i.reference,
      status: i.status,
      customer: i.customer?.name ?? "Guest",
      branch: i.branch?.name ?? null,
      createdAt: i.createdAt,
    })),
  });
});

/* ─────────────── Branches ─────────────── */
adminRouter.get("/branches", async (req, res) => {
  const p = req.principal!;
  const branches = await prisma.branch.findMany({
    where: { tenantId: p.tenantId },
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true, inquiries: true, appointments: true } } },
  });
  res.json(branches);
});

adminRouter.post("/branches", requireRole("OWNER", "COMPANY_ADMIN"), async (req, res) => {
  const p = req.principal!;
  const body = z
    .object({ name: z.string().min(1), city: z.string().min(1), address: z.string().optional(), phone: z.string().optional(), hours: z.string().optional() })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid payload" });
  const branch = await prisma.branch.create({ data: { tenantId: p.tenantId, ...body.data } });
  res.status(201).json(branch);
});

/* ─────────────── Categories & Collections ─────────────── */
adminRouter.get("/categories", async (req, res) => {
  const p = req.principal!;
  res.json(await prisma.category.findMany({ where: { tenantId: p.tenantId }, orderBy: { sort: "asc" } }));
});
adminRouter.get("/collections", async (req, res) => {
  const p = req.principal!;
  res.json(await prisma.collection.findMany({ where: { tenantId: p.tenantId }, orderBy: { name: "asc" } }));
});

/* ─────────────── Suppliers ─────────────── */
adminRouter.get("/suppliers", async (req, res) => {
  const p = req.principal!;
  res.json(await prisma.supplier.findMany({ where: { tenantId: p.tenantId }, orderBy: { name: "asc" } }));
});
adminRouter.post("/suppliers", requireRole("OWNER", "COMPANY_ADMIN", "INVENTORY_STAFF"), async (req, res) => {
  const p = req.principal!;
  const body = z
    .object({ name: z.string().min(1), contact: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), categories: z.array(z.string()).default([]), payable: z.number().default(0) })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid payload" });
  res.status(201).json(await prisma.supplier.create({ data: { tenantId: p.tenantId, ...body.data } }));
});

/* ─────────────── Offers ─────────────── */
adminRouter.get("/offers", async (req, res) => {
  const p = req.principal!;
  res.json(await prisma.offer.findMany({ where: { tenantId: p.tenantId }, orderBy: { createdAt: "desc" } }));
});
adminRouter.post("/offers", requireRole("OWNER", "COMPANY_ADMIN", "BRANCH_MANAGER"), async (req, res) => {
  const p = req.principal!;
  const body = z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      image: z.string().optional(),
      discount: z.number().default(0),
      code: z.string().optional(),
      validUntil: z.string().optional(),
      status: z.enum(["DRAFT", "ACTIVE", "EXPIRED"]).default("ACTIVE"),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid payload" });
  const offer = await prisma.offer.create({
    data: {
      tenantId: p.tenantId,
      title: body.data.title,
      description: body.data.description,
      image: body.data.image,
      discount: body.data.discount,
      code: body.data.code,
      status: body.data.status,
      validUntil: body.data.validUntil ? new Date(body.data.validUntil) : null,
    },
  });
  res.status(201).json(offer);
});
adminRouter.patch("/offers/:id", requireRole("OWNER", "COMPANY_ADMIN", "BRANCH_MANAGER"), async (req, res) => {
  const p = req.principal!;
  const existing = await prisma.offer.findFirst({ where: { id: req.params.id, tenantId: p.tenantId } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  const body = z.object({ status: z.enum(["DRAFT", "ACTIVE", "EXPIRED"]).optional() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid payload" });
  res.json(await prisma.offer.update({ where: { id: existing.id }, data: body.data }));
});

/* ─────────────── Gold rate admin (history + manual override) ─────────────── */
adminRouter.get("/gold/history", async (req, res) => {
  const p = req.principal!;
  const karat = Number(req.query.karat ?? 22);
  const rows = await prisma.goldPriceObservation.findMany({
    where: { tenantId: p.tenantId, karat },
    orderBy: { observedAt: "desc" },
    take: 60,
  });
  res.json(rows);
});

adminRouter.post("/gold/override", requireRole("OWNER", "COMPANY_ADMIN", "BRANCH_MANAGER"), async (req, res) => {
  const p = req.principal!;
  const body = z
    .object({ karat: z.number().int(), pricePerGram: z.number().positive() })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid payload" });
  const obs = await prisma.goldPriceObservation.create({
    data: { tenantId: p.tenantId, karat: body.data.karat, pricePerGram: body.data.pricePerGram, source: "MANUAL" },
  });
  await audit({ tenantId: p.tenantId, userId: p.sub, action: "gold.override", entity: "GoldPriceObservation", entityId: obs.id, meta: body.data });
  res.status(201).json(obs);
});

/* ─────────────── Users / team ─────────────── */
adminRouter.get("/users", requireRole("OWNER", "COMPANY_ADMIN"), async (req, res) => {
  const p = req.principal!;
  const users = await prisma.user.findMany({
    where: { tenantId: p.tenantId },
    orderBy: { createdAt: "asc" },
    include: { branch: true },
  });
  res.json(
    users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, branch: u.branch?.name ?? null, active: u.active, lastLoginAt: u.lastLoginAt })),
  );
});

adminRouter.post("/users", requireRole("OWNER", "COMPANY_ADMIN"), async (req, res) => {
  const p = req.principal!;
  const body = z
    .object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(["OWNER", "COMPANY_ADMIN", "BRANCH_MANAGER", "SALES_STAFF", "INVENTORY_STAFF", "ANALYST"]),
      branchId: z.string().optional().nullable(),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid payload" });
  const exists = await prisma.user.findFirst({ where: { tenantId: p.tenantId, email: body.data.email.toLowerCase() } });
  if (exists) return res.status(409).json({ error: "Email already in use" });
  const user = await prisma.user.create({
    data: {
      tenantId: p.tenantId,
      name: body.data.name,
      email: body.data.email.toLowerCase(),
      passwordHash: await hashPassword(body.data.password),
      role: body.data.role,
      branchId: body.data.branchId || null,
    },
  });
  await audit({ tenantId: p.tenantId, userId: p.sub, action: "user.create", entity: "User", entityId: user.id });
  res.status(201).json({ id: user.id });
});

/* ─────────────── Audit log ─────────────── */
adminRouter.get("/audit", requireRole("OWNER", "COMPANY_ADMIN"), async (req, res) => {
  const p = req.principal!;
  const logs = await prisma.auditLog.findMany({
    where: { tenantId: p.tenantId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: true },
  });
  res.json(logs.map((l) => ({ id: l.id, action: l.action, entity: l.entity, user: l.user?.name ?? "System", createdAt: l.createdAt })));
});
