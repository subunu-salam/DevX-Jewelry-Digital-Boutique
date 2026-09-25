import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import {
  hashPassword,
  signToken,
  verifyPassword,
} from "../lib/auth.js";
import { authenticate } from "../middleware/auth.js";
import { audit } from "../lib/audit.js";

export const authRouter = Router();

async function defaultTenantId(): Promise<string> {
  const t = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!t) throw new Error("No tenant configured");
  return t.id;
}

/* ───────────────── Staff login (CRM) ───────────────── */
authRouter.post("/staff/login", async (req, res) => {
  const body = z
    .object({ email: z.string().email(), password: z.string().min(1) })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid payload" });

  const user = await prisma.user.findFirst({
    where: { email: body.data.email.toLowerCase(), active: true },
    include: { tenant: true, branch: true },
  });
  if (!user || !(await verifyPassword(body.data.password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await audit({ tenantId: user.tenantId, userId: user.id, action: "login", entity: "User", entityId: user.id });

  const token = signToken({
    sub: user.id,
    type: "staff",
    tenantId: user.tenantId,
    role: user.role,
    branchId: user.branchId,
  });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
      branchName: user.branch?.name ?? null,
      tenantName: user.tenant.name,
    },
  });
});

/* ───────────────── Customer register (Boutique) ───────────────── */
authRouter.post("/customer/register", async (req, res) => {
  const body = z
    .object({
      name: z.string().min(2),
      phone: z.string().min(6),
      email: z.string().email().optional(),
      password: z.string().min(6),
      marketingConsent: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid payload" });

  const tenantId = await defaultTenantId();
  const existing = await prisma.customer.findFirst({
    where: { tenantId, phone: body.data.phone },
  });
  if (existing && existing.passwordHash) {
    return res.status(409).json({ error: "An account with this phone already exists" });
  }

  const passwordHash = await hashPassword(body.data.password);
  const customer = existing
    ? await prisma.customer.update({
        where: { id: existing.id },
        data: {
          name: body.data.name,
          email: body.data.email ?? existing.email,
          passwordHash,
          marketingConsent: body.data.marketingConsent ?? false,
        },
      })
    : await prisma.customer.create({
        data: {
          tenantId,
          name: body.data.name,
          phone: body.data.phone,
          email: body.data.email,
          passwordHash,
          marketingConsent: body.data.marketingConsent ?? false,
        },
      });

  const token = signToken({ sub: customer.id, type: "customer", tenantId });
  res.status(201).json({ token, customer: publicCustomer(customer) });
});

/* ───────────────── Customer login (Boutique) ───────────────── */
authRouter.post("/customer/login", async (req, res) => {
  const body = z
    .object({ phone: z.string().min(6), password: z.string().min(1) })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid payload" });

  const tenantId = await defaultTenantId();
  const customer = await prisma.customer.findFirst({
    where: { tenantId, phone: body.data.phone },
  });
  if (
    !customer ||
    !customer.passwordHash ||
    !(await verifyPassword(body.data.password, customer.passwordHash))
  ) {
    return res.status(401).json({ error: "Invalid phone or password" });
  }

  const token = signToken({ sub: customer.id, type: "customer", tenantId });
  res.json({ token, customer: publicCustomer(customer) });
});

/* ───────────────── Who am I ───────────────── */
authRouter.get("/me", authenticate, async (req, res) => {
  const p = req.principal!;
  if (p.type === "staff") {
    const user = await prisma.user.findUnique({
      where: { id: p.sub },
      include: { branch: true, tenant: true },
    });
    if (!user) return res.status(404).json({ error: "Not found" });
    return res.json({
      type: "staff",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        branchId: user.branchId,
        branchName: user.branch?.name ?? null,
        tenantName: user.tenant.name,
      },
    });
  }
  const customer = await prisma.customer.findUnique({ where: { id: p.sub } });
  if (!customer) return res.status(404).json({ error: "Not found" });
  res.json({ type: "customer", customer: publicCustomer(customer) });
});

function publicCustomer(c: {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  savedProductIds: string[];
  marketingConsent: boolean;
}) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    savedProductIds: c.savedProductIds,
    marketingConsent: c.marketingConsent,
  };
}
