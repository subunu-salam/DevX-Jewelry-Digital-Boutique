import { Router } from "express";
import { TRYON_TYPES, assetUrlFor, isGalleryMedia, model3dUrl, resolveTryOn, typeFromCategory } from "../lib/tryon.js";
import express from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireStaff, requireRole } from "../middleware/auth.js";
import { audit } from "../lib/audit.js";
import { downloadGlb, getTask, meshyEnabled, startImageTo3D } from "../lib/meshy.js";

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
      image: (pr.media.filter(isGalleryMedia).find((m) => m.isPrimary) ?? pr.media.filter(isGalleryMedia)[0])?.url ?? null,
      tryOn: tryOnSettings(pr),
      model3d: model3dUrl(pr.media),
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
  tryOn: z
    .object({
      enabled: z.boolean(),
      type: z.enum(["auto", "necklace", "pendant", "earrings", "ring", "bracelet"]).default("auto"),
      // https cut-out link, or a Try-on Studio asset path (/api/public/tryon-assets/…)
      assetUrl: z.string().max(2048).refine((u) => /^https:\/\//.test(u) || u.startsWith("/api/public/tryon-assets/"), "Must be an https:// link").nullable().optional(),
    })
    .optional(),
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
        create: [
          ...d.images.map((url, i) => ({ url, isPrimary: i === 0, sort: i })),
          ...(d.tryOn ? [tryOnRow(d.tryOn)] : []),
        ],
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
  res.json({ ...product, images: product.media.filter(isGalleryMedia).map((m) => m.url), tryOn: tryOnSettings({ ...product, category: null }), model3d: model3dUrl(product.media) });
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
    await prisma.productMedia.deleteMany({ where: { productId: existing.id, NOT: { kind: { startsWith: "tryon" } } } });
    await prisma.productMedia.createMany({
      data: d.images.map((url, i) => ({ productId: existing.id, url, isPrimary: i === 0, sort: i })),
    });
  }
  if (d.tryOn) {
    await prisma.productMedia.deleteMany({ where: { productId: existing.id, kind: { startsWith: "tryon" } } });
    await prisma.productMedia.create({ data: { productId: existing.id, ...tryOnRow(d.tryOn), sort: 999 } });
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

/* ── Virtual try-on settings (PRD: Virtual Try-On, CRM-managed AR assets) ── */
function tryOnRow(t: { enabled: boolean; type: string; assetUrl?: string | null }) {
  // Encoded as a media row so no schema migration is needed — see lib/tryon.ts.
  return { kind: t.enabled ? `tryon:${t.type}` : "tryon:off", url: t.enabled && t.assetUrl ? t.assetUrl : "auto", isPrimary: false, sort: 999 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tryOnSettings(pr: any) {
  const row = pr.media.find((m: { kind: string }) => m.kind.startsWith("tryon"));
  const resolved = resolveTryOn(pr);
  return {
    enabled: !!resolved,
    type: row ? (row.kind.split(":")[1] === "off" ? "auto" : row.kind.split(":")[1]) : "auto",
    assetUrl: row && row.url !== "auto" ? row.url : null,
    effectiveType: resolved?.type ?? null,
    categoryType: typeFromCategory(pr.category?.slug),
  };
}


/* ── Try-on Studio: save a transparent cut-out made in the CRM ── */
const editors = requireRole("OWNER", "COMPANY_ADMIN", "BRANCH_MANAGER", "INVENTORY_STAFF");
productRouter.put("/:id/tryon-asset", editors, async (req, res) => {
  const p = req.principal!;
  const body = z.object({
    type: z.enum(TRYON_TYPES),
    png: z.string().startsWith("data:image/png;base64,").max(6_000_000),
    width: z.number().int().min(16).max(2400),
    height: z.number().int().min(16).max(2400),
    anchorX: z.number().min(0).max(1),
    anchorY: z.number().min(0).max(1),
    widthMm: z.number().min(2).max(600).nullable().optional(),
    pair: z.boolean().default(false),
    splitX: z.number().min(0.1).max(0.9).nullable().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "The cut-out couldn't be saved — try exporting again.", detail: body.error.flatten() });
  const product = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: p.tenantId } });
  if (!product) return res.status(404).json({ error: "Product not found" });
  const d = body.data;
  const png = Buffer.from(d.png.slice("data:image/png;base64,".length), "base64");
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return res.status(400).json({ error: "Not a PNG image" });
  const saved = await prisma.tryOnAsset.upsert({
    where: { productId: product.id },
    create: { productId: product.id, png, width: d.width, height: d.height },
    update: { png, width: d.width, height: d.height },
  });
  const url = assetUrlFor(product.id, { v: saved.updatedAt.getTime(), ax: d.anchorX, ay: d.anchorY, mm: d.widthMm, pair: d.pair, sx: d.splitX });
  await prisma.productMedia.deleteMany({ where: { productId: product.id, kind: { startsWith: "tryon" } } });
  await prisma.productMedia.create({ data: { productId: product.id, kind: `tryon:${d.type}`, url, isPrimary: false, sort: 999 } });
  await audit({ tenantId: p.tenantId, userId: p.sub, action: "product.tryon_asset", entity: "Product", entityId: product.id, meta: { type: d.type, bytes: png.length } });
  res.json({ assetUrl: url });
});

productRouter.delete("/:id/tryon-asset", editors, async (req, res) => {
  const p = req.principal!;
  const product = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: p.tenantId }, include: { media: true } });
  if (!product) return res.status(404).json({ error: "Product not found" });
  await prisma.tryOnAsset.deleteMany({ where: { productId: product.id } });
  const row = product.media.find((m) => m.kind.startsWith("tryon") && m.url.startsWith("/api/public/tryon-assets/"));
  if (row) await prisma.productMedia.update({ where: { id: row.id }, data: { url: "auto" } });
  res.json({ ok: true });
});


/* ── 3D model (.glb) for "View in 3D" and 3D try-on ──
 * Body: the raw .glb file. Query: fileName, piece (which piece of a multi-piece file),
 * mm (ring inner diameter / piece size in mm). */
productRouter.put("/:id/model3d", editors, express.raw({ type: () => true, limit: "40mb" }), async (req, res) => {
  const p = req.principal!;
  const q = z.object({
    fileName: z.string().max(200).default("model.glb"),
    piece: z.coerce.number().int().min(0).max(20).default(0),
    mm: z.coerce.number().min(2).max(600).optional(),
    source: z.enum(["upload", "photo"]).optional(),
  }).safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: "Invalid model settings" });
  const glb = req.body as Buffer;
  if (!Buffer.isBuffer(glb) || glb.length < 20 || glb.subarray(0, 4).toString("latin1") !== "glTF")
    return res.status(400).json({ error: "Please upload a binary glTF (.glb) file" });
  const product = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: p.tenantId } });
  if (!product) return res.status(404).json({ error: "Product not found" });
  const url = await saveModel(product.id, glb, q.data);
  await audit({ tenantId: p.tenantId, userId: p.sub, action: "product.model3d", entity: "Product", entityId: product.id, meta: { bytes: glb.length, fileName: q.data.fileName, source: q.data.source } });
  res.json({ model3d: url });
});

/** Store a .glb for a product and point its "model3d" media row at it. */
async function saveModel(productId: string, glb: Buffer, o: { fileName: string; piece?: number; mm?: number; tex?: boolean; source?: string }) {
  const saved = await prisma.model3DAsset.upsert({
    where: { productId },
    create: { productId, glb, fileName: o.fileName },
    update: { glb, fileName: o.fileName },
  });
  const sp = new URLSearchParams({ v: String(saved.updatedAt.getTime()), piece: String(o.piece ?? 0) });
  if (o.mm) sp.set("mm", String(o.mm));
  if (o.tex) sp.set("tex", "1");
  if (o.source) sp.set("src", o.source);
  const url = `/api/public/models/${productId}?${sp.toString()}`;
  await prisma.productMedia.deleteMany({ where: { productId, kind: "model3d" } });
  await prisma.productMedia.create({ data: { productId, kind: "model3d", url, isPrimary: false, sort: 998 } });
  return url;
}

/* ── Photo → 3D with AI (optional, MESHY_API_KEY) ──
 * POST starts a job from the jewellery photo; GET polls it and, when done, stores the model
 * exactly like an uploaded .glb so it appears in "View in 3D" and the 3D try-on. */
productRouter.get("/ai-3d/config", (_req, res) => res.json({ enabled: meshyEnabled(), provider: meshyEnabled() ? "Meshy" : null }));

productRouter.post("/:id/model3d/ai", editors, express.json({ limit: "16mb" }), async (req, res) => {
  const p = req.principal!;
  if (!meshyEnabled()) return res.status(503).json({ error: "AI 3D isn't set up — add MESHY_API_KEY on the server, or use the on-device photo-to-3D." });
  const d = z.object({ image: z.string().refine((u) => /^data:image\/(png|jpe?g|webp);base64,/.test(u) || /^https:\/\//.test(u), "Send a PNG/JPEG data URL or https link").refine((u) => u.length < 15_000_000, "Image is too large") }).safeParse(req.body);
  if (!d.success) return res.status(400).json({ error: d.error.issues[0]?.message ?? "Invalid image" });
  const product = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: p.tenantId } });
  if (!product) return res.status(404).json({ error: "Product not found" });
  try {
    const taskId = await startImageTo3D(d.data.image);
    await audit({ tenantId: p.tenantId, userId: p.sub, action: "product.model3d_ai_start", entity: "Product", entityId: product.id, meta: { taskId } });
    res.status(202).json({ taskId });
  } catch (e) { res.status(502).json({ error: (e as Error).message }); }
});

productRouter.get("/:id/model3d/ai/:taskId", editors, async (req, res) => {
  const p = req.principal!;
  if (!meshyEnabled()) return res.status(503).json({ error: "AI 3D isn't set up" });
  const q = z.object({ mm: z.coerce.number().min(2).max(600).optional() }).safeParse(req.query);
  const product = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: p.tenantId }, include: { media: true } });
  if (!product) return res.status(404).json({ error: "Product not found" });
  try {
    const t = await getTask(req.params.taskId);
    if (t.status === "SUCCEEDED" && t.model_urls?.glb) {
      // idempotent: the first poll that sees success stores it
      const already = product.media.find((m) => m.kind === "model3d" && m.url.includes(`src=ai-${t.id.slice(0, 12)}`));
      const url = already?.url ?? await saveModel(product.id, await downloadGlb(t.model_urls.glb), {
        fileName: `${product.sku || "piece"}-ai.glb`, mm: q.success ? q.data.mm : undefined, tex: true, source: `ai-${t.id.slice(0, 12)}`,
      });
      if (!already) await audit({ tenantId: p.tenantId, userId: p.sub, action: "product.model3d", entity: "Product", entityId: product.id, meta: { source: "ai", taskId: t.id } });
      return res.json({ status: "SUCCEEDED", progress: 100, model3d: url });
    }
    if (t.status === "FAILED" || t.status === "CANCELED") return res.json({ status: t.status, progress: t.progress ?? 0, error: t.task_error?.message || "The 3D service couldn't build this piece — try a clearer photo on a plain background." });
    res.json({ status: t.status, progress: t.progress ?? 0 });
  } catch (e) { res.status(502).json({ error: (e as Error).message }); }
});

productRouter.delete("/:id/model3d", editors, async (req, res) => {
  const p = req.principal!;
  const product = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: p.tenantId } });
  if (!product) return res.status(404).json({ error: "Product not found" });
  await prisma.model3DAsset.deleteMany({ where: { productId: product.id } });
  await prisma.productMedia.deleteMany({ where: { productId: product.id, kind: "model3d" } });
  res.json({ ok: true });
});
