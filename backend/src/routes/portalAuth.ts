import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { signPortalToken, requirePortalAuth, PortalRequest } from "../middleware/portalAuth";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." },
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

router.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid credentials payload" });

  const customer = await prisma.customer.findFirst({ where: { email: parsed.data.email.toLowerCase() } });

  // Constant-shape response whether the account exists, isn't portal-enabled,
  // or the password is wrong - don't leak which emails have portal access.
  if (!customer || !customer.portalEnabled || !customer.portalPasswordHash) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const valid = await bcrypt.compare(parsed.data.password, customer.portalPasswordHash);
  if (!valid) return res.status(401).json({ error: "Invalid email or password" });

  const token = signPortalToken({ customerId: customer.id, email: customer.email! });
  res.json({
    token,
    customer: { id: customer.id, firstName: customer.firstName, lastName: customer.lastName, email: customer.email },
  });
});

const setPasswordSchema = z.object({ token: z.string().min(1), password: z.string().min(8) });

// Accepts an invite token (emailed by staff via POST /api/customers/:id/portal-invite)
// and sets the customer's portal password, enabling their access.
router.post("/accept-invite", async (req, res) => {
  const parsed = setPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Password must be at least 8 characters" });

  const customer = await prisma.customer.findUnique({ where: { portalInviteToken: parsed.data.token } });
  if (!customer || !customer.portalInviteExpires || customer.portalInviteExpires < new Date()) {
    return res.status(400).json({ error: "This invite link is invalid or has expired. Ask the office to resend it." });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.customer.update({
    where: { id: customer.id },
    data: { portalPasswordHash: passwordHash, portalEnabled: true, portalInviteToken: null, portalInviteExpires: null },
  });

  const token = signPortalToken({ customerId: customer.id, email: customer.email! });
  res.json({ token, customer: { id: customer.id, firstName: customer.firstName, lastName: customer.lastName, email: customer.email } });
});

router.get("/me", requirePortalAuth, async (req: PortalRequest, res) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.customer!.customerId } });
  if (!customer) return res.status(404).json({ error: "Not found" });
  res.json({ id: customer.id, firstName: customer.firstName, lastName: customer.lastName, email: customer.email, phone: customer.phone });
});

const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) });

router.post("/change-password", requirePortalAuth, async (req: PortalRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const customer = await prisma.customer.findUnique({ where: { id: req.customer!.customerId } });
  if (!customer?.portalPasswordHash) return res.status(404).json({ error: "Not found" });

  const valid = await bcrypt.compare(parsed.data.currentPassword, customer.portalPasswordHash);
  if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.customer.update({ where: { id: customer.id }, data: { portalPasswordHash: passwordHash } });
  res.json({ ok: true });
});

export default router;
