import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { optionalAuth } from "../middleware/auth.js";
import { audit, makeRef } from "../lib/audit.js";
import type { Prisma } from "@prisma/client";

export const publicRouter = Router();

async function tenantId(): Promise<string> {
  const t = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!t) throw new Error("No tenant configured");
  return t.id;
}

/* ── Storefront meta (tenant, branches, categories, collections) ── */
publicRouter.get("/storefront", async (_req, res) => {
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) return res.status(404).json({ error: "No storefront" });
  const [branches, categories, collections] = await Promise.all([
    prisma.branch.findMany({ where: { tenantId: tenant.id, active: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { tenantId: tenant.id }, orderBy: { sort: "asc" } }),
    prisma.collection.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } }),
  ]);
  res.json({
    tenant: { name: tenant.name, currency: tenant.currency, logoUrl: tenant.logoUrl },
    branches,
    categories,
    collections,
  });
});

/* ── Product listing with filters ── */
publicRouter.get("/products", async (req, res) => {
  const tId = await tenantId();
  const q = req.query;
  const where: Prisma.ProductWhereInput = { tenantId: tId, active: true };

  if (q.category) where.category = { slug: String(q.category) };
  if (q.collection) where.collection = { slug: String(q.collection) };
  if (q.metal) where.metal = String(q.metal);
  if (q.karat) where.karat = Number(q.karat);
  if (q.gender) where.gender = String(q.gender);
  if (q.featured === "true") where.featured = true;
  if (q.isNew === "true") where.isNew = true;
  if (q.search) {
    const s = String(q.search);
    where.OR = [
      { name: { contains: s, mode: "insensitive" } },
      { description: { contains: s, mode: "insensitive" } },
      { tags: { has: s.toLowerCase() } },
    ];
  }
  if (q.minPrice || q.maxPrice) {
    where.basePrice = {};
    if (q.minPrice) (where.basePrice as Prisma.FloatFilter).gte = Number(q.minPrice);
    if (q.maxPrice) (where.basePrice as Prisma.FloatFilter).lte = Number(q.maxPrice);
  }

  const sortMap: Record<string, Prisma.ProductOrderByWithRelationInput> = {
    newest: { createdAt: "desc" },
    price_asc: { basePrice: "asc" },
    price_desc: { basePrice: "desc" },
    name: { name: "asc" },
  };
  const orderBy = sortMap[String(q.sort ?? "newest")] ?? { createdAt: "desc" };

  const take = Math.min(Number(q.limit ?? 48), 100);
  const products = await prisma.product.findMany({
    where,
    orderBy,
    take,
    include: {
      media: { orderBy: { sort: "asc" } },
      category: true,
      collection: true,
      inventory: { include: { branch: true } },
    },
  });
  res.json(products.map((p) => serializeProduct(p)));
});

/* ── Single product ── */
publicRouter.get("/products/:slug", async (req, res) => {
  const tId = await tenantId();
  const product = await prisma.product.findFirst({
    where: { tenantId: tId, slug: req.params.slug, active: true },
    include: {
      media: { orderBy: { sort: "asc" } },
      category: true,
      collection: true,
      inventory: { include: { branch: true } },
    },
  });
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(serializeProduct(product, true));
});

/* ── Offers ── */
publicRouter.get("/offers", async (_req, res) => {
  const tId = await tenantId();
  const offers = await prisma.offer.findMany({
    where: { tenantId: tId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  res.json(offers);
});

/* ── Gold rate: current + history ── */
publicRouter.get("/gold/current", async (_req, res) => {
  const tId = await tenantId();
  const karats = [24, 22, 21, 18];
  const rows = await Promise.all(
    karats.map((k) =>
      prisma.goldPriceObservation.findFirst({
        where: { tenantId: tId, karat: k },
        orderBy: { observedAt: "desc" },
      }),
    ),
  );
  const rates = karats.map((k, i) => ({
    karat: k,
    pricePerGram: rows[i]?.pricePerGram ?? null,
    source: rows[i]?.source ?? null,
    observedAt: rows[i]?.observedAt ?? null,
  }));
  res.json({ currency: "AED", rates, timestamp: rows[0]?.observedAt ?? null });
});

publicRouter.get("/gold/history", async (req, res) => {
  const tId = await tenantId();
  const karat = Number(req.query.karat ?? 22);
  const range = String(req.query.range ?? "6M");
  const days: Record<string, number> = { "1M": 30, "3M": 90, "6M": 180, "1Y": 365 };
  const since = new Date();
  since.setDate(since.getDate() - (days[range] ?? 180));

  const rows = await prisma.goldPriceObservation.findMany({
    where: { tenantId: tId, karat, observedAt: { gte: since } },
    orderBy: { observedAt: "asc" },
    select: { pricePerGram: true, observedAt: true, source: true },
  });
  res.json({ karat, range, points: rows });
});

/* ── Create inquiry (cart → lead) ── */
publicRouter.post("/inquiries", optionalAuth, async (req, res) => {
  const body = z
    .object({
      customer: z
        .object({
          name: z.string().min(2),
          phone: z.string().min(6),
          email: z.string().email().optional().or(z.literal("")),
        })
        .optional(),
      branchId: z.string().optional(),
      occasion: z.string().optional(),
      budget: z.number().optional(),
      notes: z.string().optional(),
      items: z
        .array(
          z.object({
            productId: z.string().optional(),
            productName: z.string().min(1),
            quantity: z.number().int().positive().default(1),
            note: z.string().optional(),
          }),
        )
        .min(1),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid payload", detail: body.error.flatten() });

  const tId = await tenantId();
  const p = req.principal;

  // Resolve or create the customer record.
  let customerId: string | undefined;
  if (p?.type === "customer") {
    customerId = p.sub;
  } else if (body.data.customer) {
    const c = body.data.customer;
    const existing = await prisma.customer.findFirst({ where: { tenantId: tId, phone: c.phone } });
    customerId = existing
      ? existing.id
      : (
          await prisma.customer.create({
            data: { tenantId: tId, name: c.name, phone: c.phone, email: c.email || null },
          })
        ).id;
  }

  const inquiry = await prisma.inquiry.create({
    data: {
      tenantId: tId,
      reference: makeRef("INQ"),
      customerId,
      branchId: body.data.branchId,
      occasion: body.data.occasion,
      budget: body.data.budget,
      notes: body.data.notes,
      source: "boutique",
      items: {
        create: body.data.items.map((it) => ({
          productId: it.productId,
          productName: it.productName,
          quantity: it.quantity,
          note: it.note,
        })),
      },
    },
    include: { items: true },
  });

  await audit({ tenantId: tId, action: "inquiry.create", entity: "Inquiry", entityId: inquiry.id, meta: { source: "boutique" } });
  res.status(201).json({ reference: inquiry.reference, id: inquiry.id });
});

/* ── Book appointment ── */
publicRouter.post("/appointments", optionalAuth, async (req, res) => {
  const body = z
    .object({
      customer: z
        .object({
          name: z.string().min(2),
          phone: z.string().min(6),
          email: z.string().email().optional().or(z.literal("")),
        })
        .optional(),
      branchId: z.string().min(1),
      reason: z.string().optional(),
      scheduledAt: z.string(),
      notes: z.string().optional(),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid payload" });

  const tId = await tenantId();
  const p = req.principal;
  let customerId: string | undefined;
  if (p?.type === "customer") customerId = p.sub;
  else if (body.data.customer) {
    const c = body.data.customer;
    const existing = await prisma.customer.findFirst({ where: { tenantId: tId, phone: c.phone } });
    customerId = existing
      ? existing.id
      : (await prisma.customer.create({ data: { tenantId: tId, name: c.name, phone: c.phone, email: c.email || null } })).id;
  }

  const appt = await prisma.appointment.create({
    data: {
      tenantId: tId,
      reference: makeRef("APT"),
      customerId,
      branchId: body.data.branchId,
      reason: body.data.reason ?? "Showroom visit",
      scheduledAt: new Date(body.data.scheduledAt),
      notes: body.data.notes,
    },
  });
  await audit({ tenantId: tId, action: "appointment.create", entity: "Appointment", entityId: appt.id });
  res.status(201).json({ reference: appt.reference, id: appt.id });
});

/* ── Public quote view via share token ── */
publicRouter.get("/quotes/shared/:token", async (req, res) => {
  const quote = await prisma.quotation.findUnique({
    where: { shareToken: req.params.token },
    include: { items: true, customer: true, branch: true, tenant: true },
  });
  if (!quote) return res.status(404).json({ error: "Quote not found" });
  res.json({
    reference: quote.reference,
    status: quote.status,
    tenantName: quote.tenant.name,
    customerName: quote.customer?.name ?? null,
    branchName: quote.branch?.name ?? null,
    currency: quote.tenant.currency,
    items: quote.items,
    subtotal: quote.subtotal,
    makingTotal: quote.makingTotal,
    discount: quote.discount,
    taxRate: quote.taxRate,
    taxTotal: quote.taxTotal,
    total: quote.total,
    validUntil: quote.validUntil,
    notes: quote.notes,
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeProduct(p: any, full = false) {
  const primary = p.media.find((m: any) => m.isPrimary) ?? p.media[0];
  const availability = p.inventory.map((inv: any) => ({
    branchId: inv.branchId,
    branchName: inv.branch?.name,
    quantity: inv.quantity - inv.reserved,
  }));
  const base = {
    id: p.id,
    sku: p.sku,
    name: p.name,
    slug: p.slug,
    priceMode: p.priceMode,
    basePrice: p.basePrice,
    discount: p.discount,
    metal: p.metal,
    karat: p.karat,
    metalColor: p.metalColor,
    grossWeight: p.grossWeight,
    netWeight: p.netWeight,
    gender: p.gender,
    occasion: p.occasion,
    category: p.category ? { name: p.category.name, slug: p.category.slug } : null,
    collection: p.collection ? { name: p.collection.name, slug: p.collection.slug } : null,
    image: primary?.url ?? null,
    featured: p.featured,
    isNew: p.isNew,
    tags: p.tags,
    availability,
  };
  if (!full) return base;
  return {
    ...base,
    description: p.description,
    stoneType: p.stoneType,
    stoneCount: p.stoneCount,
    totalCarat: p.totalCarat,
    dimensions: p.dimensions,
    certNumber: p.certNumber,
    certIssuer: p.certIssuer,
    warranty: p.warranty,
    media: p.media.map((m: any) => ({ url: m.url, kind: m.kind })),
  };
}
