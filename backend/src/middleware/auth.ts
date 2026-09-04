import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";

export interface AuthedRequest extends Request {
  user?: {
    id: string;
    roles: UserRole[];
    email: string;
  };
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Fail loudly at boot rather than silently signing with an empty secret.
  throw new Error("JWT_SECRET must be set in the environment");
}

export function signToken(payload: { id: string; roles: UserRole[]; email: string }) {
  return jwt.sign(payload, JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN as any) || "8h",
  });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET as string) as {
      id: string;
      roles: UserRole[];
      email: string;
    };
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * True when a user holds ONLY the Technician role - i.e. someone wearing
 * ADMIN or OFFICE alongside TECHNICIAN (a solo operator covering every hat)
 * gets full visibility rather than being scoped to just their assigned jobs.
 */
export function isPureTechnician(roles: UserRole[]) {
  return roles.includes(UserRole.TECHNICIAN) && !roles.includes(UserRole.ADMIN) && !roles.includes(UserRole.OFFICE);
}

/**
 * Restricts a route to users holding at least one of the given roles.
 * Server-side authorization only - the client never gets to decide what
 * it's allowed to do.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!req.user.roles.some((r) => roles.includes(r))) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
