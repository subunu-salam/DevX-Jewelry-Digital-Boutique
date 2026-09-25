import { prisma } from "../prisma.js";

export async function audit(params: {
  tenantId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: unknown;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        meta: params.meta ? JSON.stringify(params.meta) : null,
      },
    });
  } catch {
    // Audit must never break the main request path.
  }
}

/** Short human reference like INQ-3F9A2. */
export function makeRef(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}
