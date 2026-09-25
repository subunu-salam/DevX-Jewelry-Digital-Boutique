import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

export type Principal = {
  sub: string;
  type: "staff" | "customer";
  tenantId: string;
  role?: string;
  branchId?: string | null;
};

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(principal: Principal): string {
  return jwt.sign(principal, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): Principal | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as Principal;
  } catch {
    return null;
  }
}
