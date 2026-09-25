import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireStaff, requireRole } from "../middleware/auth.js";
import { audit } from "../lib/audit.js";

export const productRouter = Router();
productRouter.use(requireStaff);

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/* List */
productRouter.get("/", async (req, res) => {
  const p = req.principal!;
  const products = await prisma.product.findMany({
    where: { tenantId: p.tenantId },
    orderBy: { updatedAt: "desc" },
    include: {
      media: { orderBy: { sort: "asc" } },
      category: true,
      collection: true,
      inventory: { include: { branch: true } },
    },
  });
  res.json(
    products.map((pr) => ({
      id: pr.id,
      sku: pr.sku,
      name: pr.name,
      slug: pr.slug,
      priceMode: pr.priceMode,
      basePrice: pr.basePrice,
      metal: pr.metal,
      karat: pr.karat,
      grossWeight: pr.grossWeight,
      netWeight: pr.netWeight,
      category: pr.category?.name ?? null,
      collection: pr.collection?.name ?? null,
      image: (pr.media.find((m) => m.isPrimary) ?? pr.media[0])?.url ?? null,
      featured: pr.featured,
      isNew: pr.isNew,
      active: pr.active,
      totalStock: pr.inventory.reduce((s, i) => s + i.quantity, 0),
      inventory: pr.inventory.map((i) => ({
        branchId: i.branchId,
        branchName: i.branch.name,
        quantity: i.quantity,
        reserved: i.reserved,
      })),
    })),
  );
});

const productSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().optional().nullable(),
  collectionId: z.string().optional().nullable(),
  priceMode: z.enum(["FIXED", "INQUIRY"]).default("FIXED"),
  basePrice: z.number().default(0),
  makingCharge: z.number().default(0),
  discount: z.number().default(0),
  metal: z.string().default("Gold"),
  karat: z.number().int().default(22),
  metalColor: z.string().default("Yellow"),
  grossWeight: z.number().default(0),
  netWeight: z.number().default(0),
  stoneType: z.string().optional().nullable(),
  stoneCount: z.number().int().default(0),
  totalCarat: z.number().default(0),
  dimensions: z.string().optional().nullable(),
  gender: z.string().default("Unisex"),
  occasion: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  certNumber: z.string().optional().nullable(),
  certIssuer: z.string().optional().nullable(),
  warranty: z.string().optional().nullable(),
  featured: z.boolean().default(false),
  isNew: z.boolean().default(false),
  active: z.boolean().default(true),
  images: z.array(z.string()).default([]),
  inventory: z
    .array(z.object({ branchId: z.string(), quantity: z.number().int().min(0) }))
    .default([]),
});

/* Create */
productRouter.post("/", requireRole("OWNER", "COMPANY_ADMIN", "BRANCH_MANAGER", "INVENTORY_STAFF"), async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", detail: parsed.error.flatten() });
  const p = req.principal!;
  const d = parsed.data;

  const product = await prisma.product.create({
    data: {
      tenantId: p.tenantId,
      sku: d.sku,
      name: d.name,
      slug: slugify(d.name) + "-" + d.sku.toLowerCase(),
      description: d.description,
      categoryId: d.categoryId || null,
      collectionId: d.collectionId || null,
      priceMode: d.priceMode,
      basePrice: d.basePrice,
      makingCharge: d.makingCharge,
      discount: d.discount,
      metal: d.metal,
      karat: d.karat,
      metalColor: d.metalColor,
      grossWeight: d.grossWeight,
      netWeight: d.netWeight,
      stoneType: d.stoneType,
      stoneCount: d.stoneCount,
      totalCarat: d.totalCarat,
      dimensions: d.dimensions,
      gender: d.gender,
      occasion: d.occasion,
      tags: d.tags,
      certNumber: d.certNumber,
      certIssuer: d.certIssuer,
      warranty: d.warranty,
      featured: d.featured,
      isNew: d.isNew,
      active: d.active,
      media: {
        create: d.images.map((url, i) => ({ url, isPrimary: i === 0, sort: i })),
      },
      inventory: {
        create: d.inventory.map((inv) => ({ branchId: inv.branchId, quantity: inv.quantity })),
      },
    },
  });
  await audit({ tenantId: p.tenantId, userId: p.sub, action: "product.create", entity: "Product", entityId: product.id });
  res.status(201).json({ id: product.id });
});

/* Read */
productRouter.get("/:id", async (req, res) => {
  const p = req.principal!;
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, tenantId: p.tenantId },
    include: { media: { orderBy: { sort: "asc" } }, inventory: true },
  });
  if (!product) return res.status(404).json({ error: "Not found" });
  res.json({ ...product, images: product.media.map((m) => m.url) });
});

/* Update */
productRouter.put("/:id", requireRole("OWNER", "COMPANY_ADMIN", "BRANCH_MANAGER", "INVENTORY_STAFF"), async (req, res) => {
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const p = req.principal!;
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: p.tenantId } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  const d = parsed.data;

  await prisma.product.update({
    where: { id: existing.id },
    data: {
      name: d.name,
      description: d.description,
      categoryId: d.categoryId === undefined ? undefined : d.categoryId || null,
      collectionId: d.collectionId === undefined ? undefined : d.collectionId || null,
      priceMode: d.priceMode,
      basePrice: d.basePrice,
      makingCharge: d.makingCharge,
      discount: d.discount,
      metal: d.metal,
      karat: d.karat,
      metalColor: d.metalColor,
      grossWeight: d.grossWeight,
      netWeight: d.netWeight,
      stoneType: d.stoneType,
      stoneCount: d.stoneCount,
      totalCarat: d.totalCarat,
      dimensions: d.dimensions,
      gender: d.gender,
      occasion: d.occasion,
      tags: d.tags,
      featured: d.featured,
      isNew: d.isNew,
      active: d.active,
    },
  });

  if (d.images) {
    await prisma.productMedia.deleteMany({ where: { productId: existing.id } });
    await prisma.productMedia.createMany({
      data: d.images.map((url, i) => ({ productId: existing.id, url, isPrimary: i === 0, sort: i })),
    });
  }
  if (d.inventory) {
    for (const inv of d.inventory) {
      await prisma.inventory.upsert({
        where: { productId_branchId: { productId: existing.id, branchId: inv.branchId } },
        update: { quantity: inv.quantity },
        create: { productId: existing.id, branchId: inv.branchId, quantity: inv.quantity },
      });
    }
  }
  await audit({ tenantId: p.tenantId, userId: p.sub, action: "product.update", entity: "Product", entityId: existing.id });
  res.json({ ok: true });
});

/* Archive */
productRouter.delete("/:id", requireRole("OWNER", "COMPANY_ADMIN"), async (req, res) => {
  const p = req.principal!;
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: p.tenantId } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  await prisma.product.update({ where: { id: existing.id }, data: { active: false } });
  await audit({ tenantId: p.tenantId, userId: p.sub, action: "product.archive", entity: "Product", entityId: existing.id });
  res.json({ ok: true });
});
