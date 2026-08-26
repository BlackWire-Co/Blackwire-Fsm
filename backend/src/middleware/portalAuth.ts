import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

// Deliberately a distinct token shape and verification path from staff auth
// (middleware/auth.ts). A customer token must never be accepted by a staff
// route, and a staff token must never be accepted here — mixing the two
// schemes is how you end up with a customer hitting an admin endpoint.
export interface PortalRequest extends Request {
  customer?: {
    customerId: string;
    email: string;
  };
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in the environment");
}

const PORTAL_SCOPE = "customer-portal";

export function signPortalToken(payload: { customerId: string; email: string }) {
  return jwt.sign({ ...payload, scope: PORTAL_SCOPE }, JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN as any) || "8h",
  });
}

export function requirePortalAuth(req: PortalRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET as string) as {
      customerId: string;
      email: string;
      scope: string;
    };
    if (decoded.scope !== PORTAL_SCOPE) {
      return res.status(401).json({ error: "Invalid session" });
    }
    req.customer = { customerId: decoded.customerId, email: decoded.email };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}
