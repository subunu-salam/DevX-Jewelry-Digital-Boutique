import type { NextFunction, Request, Response } from "express";
import { verifyToken, type Principal } from "../lib/auth.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: Principal;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

/** Requires any authenticated principal (staff or customer). */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  const principal = verifyToken(token);
  if (!principal) return res.status(401).json({ error: "Invalid or expired token" });
  req.principal = principal;
  next();
}

/** Requires an authenticated staff user (CRM). */
export function requireStaff(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  const principal = verifyToken(token);
  if (!principal || principal.type !== "staff") {
    return res.status(401).json({ error: "Staff authentication required" });
  }
  req.principal = principal;
  next();
}

/** Requires the staff user to hold one of the given roles. */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const p = req.principal;
    if (!p || p.type !== "staff") {
      return res.status(401).json({ error: "Staff authentication required" });
    }
    if (roles.length && !roles.includes(p.role ?? "")) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

/**
 * Optional auth — attaches principal if a valid token is present, but never
 * blocks. Used by public catalog endpoints that personalise when logged in.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    const principal = verifyToken(token);
    if (principal) req.principal = principal;
  }
  next();
}
