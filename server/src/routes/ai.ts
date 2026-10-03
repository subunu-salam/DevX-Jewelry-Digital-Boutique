import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { env } from "../env.js";
import { requireStaff, optionalAuth } from "../middleware/auth.js";
import { resolveTryOn, type TryOnType } from "../lib/tryon.js";

export const aiRouter = Router();

async function tenantId(): Promise<string> {
  const t = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!t) throw new Error("No tenant");
  return t.id;
}

/* ── OpenAI helper (optional) ─────────────────────────────── */
async function openaiVision(prompt: string, imageDataUrl?: string): Promise<unknown | null> {
  if (!env.OPENAI_API_KEY) return null;
  const content: unknown[] = [{ type: "text", text: prompt }];
  if (imageDataUrl) content.push({ type: "image_url", image_url: { url: imageDataUrl } });
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
      max_tokens: 700,
    }),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const txt = j.choices?.[0]?.message?.content;
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return null; }
}

/* ───────────── Visual Search (customer) ───────────── */
aiRouter.post("/visual-search", optionalAuth, async (req, res) => {
  const body = z.object({ imageBase64: z.string().optional(), category: z.string().optional() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid payload" });
  const tId = await tenantId();
  const products = await prisma.product.findMany({
    where: { tenantId: tId, active: true },
    include: { media: true, category: true },
  });
  const inv = products.map((p) => ({
    id: p.id, name: p.name, category: p.category?.name, metalColor: p.metalColor, karat: p.karat, tags: p.tags,
  }));

  // Try real vision AI when a key is configured.
  if (env.OPENAI_API_KEY && body.data.imageBase64) {
    const prompt =
      "You are visual search for a jewellery boutique. INVENTORY (JSON):\n" + JSON.stringify(inv) +
      "\n\nThe attached image is a customer's reference photo. Reply with ONLY JSON {\"matches\":[{\"id\":\"<inventory id>\",\"reason\":\"<max 8 words>\"}]} — up to 5, best first, using only inventory ids.";
    const out = (await openaiVision(prompt, body.data.imageBase64)) as { matches?: { id: string; reason: string }[] } | null;
    if (out?.matches?.length) {
      const rows = out.matches.map((m) => ({ product: serialize(products.find((p) => p.id === m.id)), reason: m.reason })).filter((x) => x.product);
      return res.json({ ai: true, matches: rows });
    }
  }

  // Fallback: filter by category if provided, else feature new/featured pieces.
  let pool = products;
  if (body.data.category) pool = products.filter((p) => p.category?.name === body.data.category);
  const picks = (pool.length ? pool : products).filter((p) => p.isNew || p.featured).slice(0, 5);
  res.json({
    ai: false,
    note: "Add an OPENAI_API_KEY on the server to enable true image similarity. Showing curated matches.",
    matches: (picks.length ? picks : pool.slice(0, 5)).map((p) => ({ product: serialize(p), reason: "Popular in this style" })),
  });
});

/* ───────────── AI Catalog Studio (staff) ───────────── */
aiRouter.post("/catalog/analyze", requireStaff, async (req, res) => {
  const body = z.object({ imageBase64: z.string().optional(), hint: z.string().optional() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid payload" });

  if (env.OPENAI_API_KEY && body.data.imageBase64) {
    const prompt =
      "You are the AI Catalog Studio for a UAE fine-jewellery retailer. Analyse the attached product photo. Reply with ONLY JSON: " +
      "{\"category\":\"Rings|Necklaces|Earrings|Bracelets|Bangles|Pendants\",\"suggestedName\":\"...\",\"metal\":\"Gold\",\"karat\":22,\"metalColor\":\"Yellow|White|Rose\",\"tags\":[\"...\"],\"description\":\"2-3 sentences\",\"seoDescription\":\"<155 chars\",\"whatsappCard\":\"short caption\"}. Best estimate if unsure.";
    const out = await openaiVision(prompt, body.data.imageBase64);
    if (out) return res.json({ ai: true, draft: out });
  }

  // Fallback: sensible template draft the staff can edit.
  res.json({
    ai: false,
    note: "Add OPENAI_API_KEY to auto-detect from the photo. Draft below is a starting template.",
    draft: {
      category: "Rings", suggestedName: "New Arrival Piece", metal: "Gold", karat: 22, metalColor: "Yellow",
      tags: ["new", "gold", "handcrafted"],
      description: "A hand-finished piece from the atelier, crafted in the heritage tradition.",
      seoDescription: "Handcrafted gold jewellery from Aurelia Fine Jewellery, Dubai.",
      whatsappCard: "New arrival at Aurelia — reserve yours today.",
    },
  });
});

/* ───────────── Jewelry Intelligence (staff) — REAL analytics from the DB ───────────── */
aiRouter.get("/intelligence", requireStaff, async (req, res) => {
  const p = req.principal!;
  const t = p.tenantId;
  const [branches, products, inquiries, invoices, inventories] = await Promise.all([
    prisma.branch.findMany({ where: { tenantId: t } }),
    prisma.product.findMany({ where: { tenantId: t }, include: { category: true } }),
    prisma.inquiry.findMany({ where: { tenantId: t }, include: { items: true, branch: true } }),
    prisma.invoice.findMany({ where: { tenantId: t }, select: { branchId: true, total: true, status: true } }),
    prisma.inventory.findMany({ where: { branch: { tenantId: t } }, include: { product: { include: { category: true } }, branch: true } }),
  ]);

  const catOf: Record<string, string> = {};
  products.forEach((pr) => (catOf[pr.name] = pr.category?.name ?? "Other"));

  // 1) Demand by category (from inquiry items)
  const catDemand: Record<string, number> = {};
  inquiries.forEach((iq) => iq.items.forEach((it) => {
    const c = catOf[it.productName] ?? "Other";
    catDemand[c] = (catDemand[c] ?? 0) + it.quantity;
  }));
  const topCat = Object.entries(catDemand).sort((a, b) => b[1] - a[1])[0];

  // 2) Branch with most demand
  const branchDemand: Record<string, number> = {};
  inquiries.forEach((iq) => { if (iq.branch) branchDemand[iq.branch.name] = (branchDemand[iq.branch.name] ?? 0) + 1; });
  const topBranch = Object.entries(branchDemand).sort((a, b) => b[1] - a[1])[0];

  // 3) Conversion
  const converted = inquiries.filter((iq) => iq.status === "CONVERTED").length;
  const conv = inquiries.length ? Math.round((converted / inquiries.length) * 100) : 0;

  // 4) Slow-moving: stock on hand with zero inquiries, by branch value
  const inquiredNames = new Set<string>();
  inquiries.forEach((iq) => iq.items.forEach((it) => inquiredNames.add(it.productName)));
  const slowByBranch: Record<string, { count: number; value: number }> = {};
  inventories.forEach((inv) => {
    if (inv.quantity > 0 && !inquiredNames.has(inv.product.name)) {
      const b = inv.branch.name;
      slowByBranch[b] = slowByBranch[b] || { count: 0, value: 0 };
      slowByBranch[b].count += inv.quantity;
      slowByBranch[b].value += inv.quantity * inv.product.basePrice;
    }
  });
  const slowTop = Object.entries(slowByBranch).sort((a, b) => b[1].value - a[1].value)[0];

  // 5) Low stock needing reorder
  const lowStock = inventories.filter((inv) => inv.quantity <= 2).length;

  const insights: { title: string; detail: string; type: string; metric: string }[] = [];
  if (topBranch && topCat) insights.push({
    type: "opportunity",
    title: `${topBranch[0]} is likely to need more ${topCat[0].toLowerCase()} in the next 30 days.`,
    detail: `${topCat[0]} is the most-requested category and ${topBranch[0]} is drawing the most inquiries — line up replenishment now.`,
    metric: `${topCat[1]} requests`,
  });
  if (slowTop) insights.push({
    type: "watch",
    title: `${slowTop[0]} is holding ${slowTop[1].count} slow-moving pieces worth ${aed(slowTop[1].value)}.`,
    detail: "These have stock on hand but no recorded inquiries — consider a transfer or a targeted campaign.",
    metric: aed(slowTop[1].value),
  });
  insights.push({
    type: conv < 20 ? "action" : "opportunity",
    title: `Inquiry-to-sale conversion is ${conv}%.`,
    detail: converted ? `${converted} of ${inquiries.length} inquiries converted — focus follow-ups on quoted leads to lift this.` : "No conversions recorded yet — prioritise follow-up on open inquiries.",
    metric: `${conv}%`,
  });
  if (lowStock) insights.push({
    type: "action",
    title: `${lowStock} SKUs are at or below 2 units across branches.`,
    detail: "Given supplier lead times, reorder fast-movers now to avoid stockouts on high-demand pieces.",
    metric: `${lowStock} SKUs`,
  });
  const totalRev = invoices.filter((i) => i.status !== "DRAFT" && i.status !== "CANCELLED").reduce((s, i) => s + i.total, 0);
  insights.push({
    type: "opportunity",
    title: `Realised revenue to date is ${aed(totalRev)}.`,
    detail: topCat ? `${topCat[0]} leads demand — weight new-arrival marketing toward it this month.` : "Track category demand as inquiries grow.",
    metric: aed(totalRev),
  });

  // Optionally enrich phrasing with AI when a key is present (never blocks).
  if (env.OPENAI_API_KEY) {
    const enriched = await openaiVision(
      "Rewrite these jewellery-retail insights to be crisp and specific for an owner. Keep the same facts and numbers. Reply ONLY as JSON {\"insights\":[{\"title\",\"detail\",\"type\",\"metric\"}]}.\n\n" + JSON.stringify(insights),
    ) as { insights?: typeof insights } | null;
    if (enriched?.insights?.length) return res.json({ ai: true, insights: enriched.insights });
  }
  res.json({ ai: false, insights });
});

function aed(n: number) { return "AED " + Math.round(n).toLocaleString("en-AE"); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(p: any) {
  if (!p) return null;
  const gallery = (p.media ?? []).filter((m: any) => !String(m.kind).startsWith("tryon"));
  const primary = gallery.find((m: any) => m.isPrimary) ?? gallery[0];
  return {
    id: p.id, name: p.name, slug: p.slug, karat: p.karat, metalColor: p.metalColor,
    category: p.category?.name ?? null, price: p.basePrice, priceMode: p.priceMode,
    image: primary?.url ?? null,
  };
}

/* ───────────── Virtual Try-On (PRD: AI Studio · Phase 2) ─────────────
 * The overlay try-on runs entirely on the customer's device (photos never leave it).
 * This module adds an optional photorealistic render via the configured AI provider.
 * It is self-contained and switchable: TRYON_AI=off disables it even when a key exists.
 * Privacy: photos are processed in memory only — never written to disk, DB or logs.
 */
const tryOnAiEnabled = () => !!env.OPENAI_API_KEY && process.env.TRYON_AI !== "off";
const TRYON_MODEL = process.env.TRYON_MODEL || "gpt-image-1";

aiRouter.get("/try-on/config", (_req, res) => {
  res.json({
    aiRender: tryOnAiEnabled(),
    disclaimer: "Virtual try-on is a visualization only. Size, fit, colour and sparkle may differ from the actual piece.",
  });
});

// Simple per-IP rate limit to protect AI spend (in-memory; per instance).
const hits = new Map<string, number[]>();
function rateLimited(ip: string, max = 6, windowMs = 15 * 60_000) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(ip, list); return true; }
  list.push(now); hits.set(ip, list);
  return false;
}

const PLACEMENT: Record<TryOnType, string> = {
  necklace: "worn around the neck, resting naturally on the collarbones",
  pendant: "worn as a pendant on a fine chain, resting just below the collarbones",
  earrings: "worn on both earlobes as a matching pair",
  ring: "worn on the ring finger",
  bracelet: "worn around the wrist",
};

function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return new Blob([new Uint8Array(Buffer.from(m[2], "base64"))], { type: m[1] });
}

aiRouter.post("/try-on/render", optionalAuth, async (req, res) => {
  if (!tryOnAiEnabled()) return res.status(503).json({ error: "AI render is not enabled for this boutique." });
  const body = z
    .object({
      productId: z.string().min(1),
      photo: z.string().startsWith("data:image/").max(6_000_000),
      consent: z.literal(true),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "A photo and consent are required." });

  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() || req.ip || "anon";
  if (rateLimited(ip)) return res.status(429).json({ error: "Please wait a few minutes before creating another render." });

  const tId = await tenantId();
  const product = await prisma.product.findFirst({
    where: { id: body.data.productId, tenantId: tId, active: true },
    include: { media: { orderBy: { sort: "asc" } }, category: true },
  });
  if (!product) return res.status(404).json({ error: "Product not found" });
  const tryOn = resolveTryOn(product);
  if (!tryOn) return res.status(400).json({ error: "Try-on isn't available for this piece." });

  const photo = dataUrlToBlob(body.data.photo);
  if (!photo) return res.status(400).json({ error: "Unsupported photo format." });

  // Reference image of the jewellery: the staff cut-out if provided, else the primary photo.
  const gallery = product.media.filter((m) => !m.kind.startsWith("tryon"));
  const refUrl = tryOn.assetUrl ?? (gallery.find((m) => m.isPrimary) ?? gallery[0])?.url;
  if (!refUrl) return res.status(400).json({ error: "This piece has no image to try on." });

  try {
    const refRes = await fetch(refUrl);
    if (!refRes.ok) throw new Error("reference fetch failed");
    const refType = refRes.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const ref = new Blob([new Uint8Array(await refRes.arrayBuffer())], { type: refType.startsWith("image/") ? refType : "image/jpeg" });

    const prompt = [
      `Image 1 is a customer's photo. Image 2 shows a ${product.karat}K ${product.metalColor.toLowerCase()} ${product.metal.toLowerCase()} jewellery piece: "${product.name}"${product.stoneType ? ` with ${product.stoneType.toLowerCase()}` : ""}.`,
      `Edit image 1 so the person is wearing exactly this piece, ${PLACEMENT[tryOn.type]}.`,
      "Reproduce the design, metal colour and stones of image 2 faithfully at a realistic, proportionate size, with natural lighting, shadows and reflections.",
      "Keep the person's face, identity, expression, skin, hair, clothing, pose and background unchanged. Do not add other jewellery, text or logos.",
    ].join(" ");

    const form = new FormData();
    form.append("model", TRYON_MODEL);
    form.append("prompt", prompt);
    form.append("image[]", photo, "photo.jpg");
    form.append("image[]", ref, "jewellery.jpg");
    form.append("size", "1024x1536");
    form.append("quality", "medium");
    form.append("n", "1");

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120_000);
    const r = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: form,
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    const j = (await r.json().catch(() => ({}))) as { data?: { b64_json?: string }[]; error?: { message?: string } };
    const b64 = j.data?.[0]?.b64_json;
    if (!r.ok || !b64) {
      console.warn("[try-on] provider error:", r.status, j.error?.message ?? "no image");
      return res.status(502).json({ error: "The AI render couldn't be created right now. Please try again." });
    }
    res.json({ image: `data:image/png;base64,${b64}`, type: tryOn.type });
  } catch (e) {
    console.warn("[try-on] render failed:", (e as Error).message);
    res.status(502).json({ error: "The AI render couldn't be created right now. Please try again." });
  }
});
