import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireStaff } from "../middleware/auth.js";
import { audit, makeRef } from "../lib/audit.js";

export const salesRouter = Router();
salesRouter.use(requireStaff);

/* ─────────────── Inquiries / Leads ─────────────── */
salesRouter.get("/inquiries", async (req, res) => {
  const p = req.principal!;
  const status = req.query.status ? String(req.query.status) : undefined;
  const inquiries = await prisma.inquiry.findMany({
    where: { tenantId: p.tenantId, status: status as never },
    orderBy: { createdAt: "desc" },
    include: {
      customer: true,
      branch: true,
      assignedTo: true,
      items: true,
      _count: { select: { items: true } },
    },
  });
  res.json(
    inquiries.map((i) => ({
      id: i.id,
      reference: i.reference,
      status: i.status,
      source: i.source,
      customerName: i.customer?.name ?? "Guest",
      customerPhone: i.customer?.phone ?? null,
      branchName: i.branch?.name ?? null,
      assignedTo: i.assignedTo?.name ?? null,
      assignedToId: i.assignedToId,
      itemCount: i._count.items,
      items: i.items,
      budget: i.budget,
      occasion: i.occasion,
      notes: i.notes,
      createdAt: i.createdAt,
    })),
  );
});

salesRouter.patch("/inquiries/:id", async (req, res) => {
  const p = req.principal!;
  const body = z
    .object({
      status: z.enum(["NEW", "QUALIFIED", "QUOTED", "APPOINTMENT", "CONVERTED", "LOST"]).optional(),
      assignedToId: z.string().nullable().optional(),
      branchId: z.string().nullable().optional(),
      notes: z.string().optional(),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid payload" });
  const existing = await prisma.inquiry.findFirst({ where: { id: req.params.id, tenantId: p.tenantId } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  const updated = await prisma.inquiry.update({ where: { id: existing.id }, data: body.data });
  await audit({ tenantId: p.tenantId, userId: p.sub, action: "inquiry.update", entity: "Inquiry", entityId: existing.id, meta: body.data });
  res.json(updated);
});

/* ─────────────── Appointments ─────────────── */
salesRouter.get("/appointments", async (req, res) => {
  const p = req.principal!;
  const appts = await prisma.appointment.findMany({
    where: { tenantId: p.tenantId },
    orderBy: { scheduledAt: "asc" },
    include: { customer: true, branch: true, staff: true },
  });
  res.json(
    appts.map((a) => ({
      id: a.id,
      reference: a.reference,
      customerName: a.customer?.name ?? "Guest",
      customerPhone: a.customer?.phone ?? null,
      branchName: a.branch.name,
      branchId: a.branchId,
      staffName: a.staff?.name ?? null,
      reason: a.reason,
      scheduledAt: a.scheduledAt,
      status: a.status,
      notes: a.notes,
    })),
  );
});

salesRouter.patch("/appointments/:id", async (req, res) => {
  const p = req.principal!;
  const body = z
    .object({
      status: z.enum(["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
      staffId: z.string().nullable().optional(),
      scheduledAt: z.string().optional(),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid payload" });
  const existing = await prisma.appointment.findFirst({ where: { id: req.params.id, tenantId: p.tenantId } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  const updated = await prisma.appointment.update({
    where: { id: existing.id },
    data: {
      status: body.data.status,
      staffId: body.data.staffId,
      scheduledAt: body.data.scheduledAt ? new Date(body.data.scheduledAt) : undefined,
    },
  });
  res.json(updated);
});

/* ─────────────── Customers ─────────────── */
salesRouter.get("/customers", async (req, res) => {
  const p = req.principal!;
  const customers = await prisma.customer.findMany({
    where: { tenantId: p.tenantId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { inquiries: true, appointments: true, invoices: true } } },
  });
  res.json(
    customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      segment: c.segment,
      marketingConsent: c.marketingConsent,
      inquiries: c._count.inquiries,
      appointments: c._count.appointments,
      invoices: c._count.invoices,
      hasAccount: !!c.passwordHash,
      createdAt: c.createdAt,
    })),
  );
});

salesRouter.get("/customers/:id", async (req, res) => {
  const p = req.principal!;
  const c = await prisma.customer.findFirst({
    where: { id: req.params.id, tenantId: p.tenantId },
    include: {
      inquiries: { include: { items: true }, orderBy: { createdAt: "desc" } },
      appointments: { include: { branch: true }, orderBy: { scheduledAt: "desc" } },
      invoices: true,
    },
  });
  if (!c) return res.status(404).json({ error: "Not found" });
  res.json(c);
});

/* ─────────────── Quotations ─────────────── */
const quoteSchema = z.object({
  inquiryId: z.string().optional(),
  customerId: z.string().optional(),
  branchId: z.string().optional(),
  taxRate: z.number().default(5),
  discount: z.number().default(0),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().optional(),
        description: z.string().min(1),
        metalValue: z.number().default(0),
        makingValue: z.number().default(0),
        stoneValue: z.number().default(0),
        quantity: z.number().int().positive().default(1),
      }),
    )
    .min(1),
});

salesRouter.get("/quotes", async (req, res) => {
  const p = req.principal!;
  const quotes = await prisma.quotation.findMany({
    where: { tenantId: p.tenantId },
    orderBy: { createdAt: "desc" },
    include: { customer: true, branch: true, _count: { select: { items: true } } },
  });
  res.json(
    quotes.map((q) => ({
      id: q.id,
      reference: q.reference,
      status: q.status,
      customerName: q.customer?.name ?? "—",
      branchName: q.branch?.name ?? null,
      total: q.total,
      items: q._count.items,
      shareToken: q.shareToken,
      validUntil: q.validUntil,
      createdAt: q.createdAt,
    })),
  );
});

salesRouter.post("/quotes", async (req, res) => {
  const parsed = quoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", detail: parsed.error.flatten() });
  const p = req.principal!;
  const d = parsed.data;

  const items = d.items.map((it) => {
    const lineTotal = (it.metalValue + it.makingValue + it.stoneValue) * it.quantity;
    return { ...it, lineTotal };
  });
  const subtotal = items.reduce((s, it) => s + it.metalValue * it.quantity, 0);
  const makingTotal = items.reduce((s, it) => s + (it.makingValue + it.stoneValue) * it.quantity, 0);
  const gross = subtotal + makingTotal - d.discount;
  const taxTotal = +(gross * (d.taxRate / 100)).toFixed(2);
  const total = +(gross + taxTotal).toFixed(2);

  const quote = await prisma.quotation.create({
    data: {
      tenantId: p.tenantId,
      reference: makeRef("QUO"),
      inquiryId: d.inquiryId,
      customerId: d.customerId,
      branchId: d.branchId,
      createdById: p.sub,
      status: "DRAFT",
      subtotal,
      makingTotal,
      discount: d.discount,
      taxRate: d.taxRate,
      taxTotal,
      total,
      validUntil: d.validUntil ? new Date(d.validUntil) : null,
      notes: d.notes,
      items: { create: items },
    },
  });
  if (d.inquiryId) {
    await prisma.inquiry.update({ where: { id: d.inquiryId }, data: { status: "QUOTED" } });
  }
  await audit({ tenantId: p.tenantId, userId: p.sub, action: "quote.create", entity: "Quotation", entityId: quote.id });
  res.status(201).json({ id: quote.id, reference: quote.reference, shareToken: quote.shareToken, total });
});

salesRouter.get("/quotes/:id", async (req, res) => {
  const p = req.principal!;
  const q = await prisma.quotation.findFirst({
    where: { id: req.params.id, tenantId: p.tenantId },
    include: { items: true, customer: true, branch: true, invoice: true },
  });
  if (!q) return res.status(404).json({ error: "Not found" });
  res.json(q);
});

salesRouter.patch("/quotes/:id", async (req, res) => {
  const p = req.principal!;
  const body = z.object({ status: z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"]) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid payload" });
  const existing = await prisma.quotation.findFirst({ where: { id: req.params.id, tenantId: p.tenantId } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  const updated = await prisma.quotation.update({ where: { id: existing.id }, data: { status: body.data.status } });
  res.json(updated);
});

/* Convert accepted quote → invoice (no re-entry of data) */
salesRouter.post("/quotes/:id/convert", async (req, res) => {
  const p = req.principal!;
  const q = await prisma.quotation.findFirst({
    where: { id: req.params.id, tenantId: p.tenantId },
    include: { items: true, invoice: true },
  });
  if (!q) return res.status(404).json({ error: "Not found" });
  if (q.invoice) return res.status(409).json({ error: "Invoice already exists", invoiceId: q.invoice.id });

  const invoice = await prisma.invoice.create({
    data: {
      tenantId: p.tenantId,
      reference: makeRef("INV"),
      quotationId: q.id,
      customerId: q.customerId,
      branchId: q.branchId,
      createdById: p.sub,
      status: "ISSUED",
      subtotal: q.subtotal + q.makingTotal - q.discount,
      taxRate: q.taxRate,
      taxTotal: q.taxTotal,
      total: q.total,
      issuedAt: new Date(),
      items: {
        create: q.items.map((it) => ({
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.lineTotal / it.quantity,
          lineTotal: it.lineTotal,
        })),
      },
    },
  });
  await prisma.quotation.update({ where: { id: q.id }, data: { status: "ACCEPTED" } });
  if (q.inquiryId) await prisma.inquiry.update({ where: { id: q.inquiryId }, data: { status: "CONVERTED" } });
  await audit({ tenantId: p.tenantId, userId: p.sub, action: "invoice.create", entity: "Invoice", entityId: invoice.id, meta: { fromQuote: q.id } });
  res.status(201).json({ id: invoice.id, reference: invoice.reference });
});

/* ─────────────── Invoices ─────────────── */
salesRouter.get("/invoices", async (req, res) => {
  const p = req.principal!;
  const invoices = await prisma.invoice.findMany({
    where: { tenantId: p.tenantId },
    orderBy: { createdAt: "desc" },
    include: { customer: true, branch: true },
  });
  res.json(
    invoices.map((i) => ({
      id: i.id,
      reference: i.reference,
      status: i.status,
      customerName: i.customer?.name ?? "—",
      branchName: i.branch?.name ?? null,
      total: i.total,
      amountPaid: i.amountPaid,
      issuedAt: i.issuedAt,
      createdAt: i.createdAt,
    })),
  );
});

salesRouter.get("/invoices/:id", async (req, res) => {
  const p = req.principal!;
  const i = await prisma.invoice.findFirst({
    where: { id: req.params.id, tenantId: p.tenantId },
    include: { items: true, customer: true, branch: true },
  });
  if (!i) return res.status(404).json({ error: "Not found" });
  res.json(i);
});

salesRouter.patch("/invoices/:id", async (req, res) => {
  const p = req.principal!;
  const body = z
    .object({
      status: z.enum(["DRAFT", "ISSUED", "PAID", "PARTIAL", "CANCELLED"]).optional(),
      amountPaid: z.number().optional(),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid payload" });
  const existing = await prisma.invoice.findFirst({ where: { id: req.params.id, tenantId: p.tenantId } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  const updated = await prisma.invoice.update({ where: { id: existing.id }, data: body.data });
  await audit({ tenantId: p.tenantId, userId: p.sub, action: "invoice.update", entity: "Invoice", entityId: existing.id, meta: body.data });
  res.json(updated);
});
