import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { signToken, requireAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { UserRole } from "@prisma/client";
import { logAudit } from "../lib/audit";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid credentials payload" });

  const email: string = parsed.data.email;
  const password: string = parsed.data.password;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  // Constant-shape response whether the user exists or not, to avoid
  // leaking which emails are registered.
  if (!user || !user.active) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signToken({ id: user.id, roles: user.roles, email: user.email });
  await logAudit({ userId: user.id, action: "user.login", entityType: "user", entityId: user.id });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles,
    },
  });
});

router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roles: user.roles,
    phone: user.phone,
  });
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  roles: z.array(z.nativeEnum(UserRole)).min(1),
  phone: z.string().optional(),
});

// Admin-only user creation. Bootstrapping the very first admin is handled
// by the seed script / setup docs, not this endpoint.
router.post("/users", requireAuth, requireRole(UserRole.ADMIN), async (req: AuthedRequest, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password, firstName, lastName, roles, phone } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return res.status(409).json({ error: "A user with that email already exists" });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email: email.toLowerCase(), passwordHash, firstName, lastName, roles, phone },
  });

  await logAudit({
    userId: req.user!.id,
    action: "user.created",
    entityType: "user",
    entityId: user.id,
  });

  res.status(201).json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roles: user.roles,
  });
});

// Admin user-management: list, deactivate/reactivate, reset password.
// Users are never hard-deleted - deactivating preserves audit/job history
// integrity (a technician's past jobs still need to point to someone).

router.get("/users", requireAuth, requireRole(UserRole.ADMIN), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, firstName: true, lastName: true, roles: true, phone: true, active: true, createdAt: true },
    orderBy: [{ active: "desc" }, { firstName: "asc" }],
  });
  res.json(users);
});

const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  roles: z.array(z.nativeEnum(UserRole)).min(1).optional(),
  active: z.boolean().optional(),
});

router.patch("/users/:id", requireAuth, requireRole(UserRole.ADMIN), async (req: AuthedRequest, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (req.params.id === req.user!.id && parsed.data.active === false) {
    return res.status(400).json({ error: "You can't deactivate your own account" });
  }

  try {
    const user = await prisma.user.update({ where: { id: req.params.id }, data: parsed.data });
    await logAudit({
      userId: req.user!.id,
      action: parsed.data.active === false ? "user.deactivated" : "user.modified",
      entityType: "user",
      entityId: user.id,
    });
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles,
      active: user.active,
    });
  } catch {
    res.status(404).json({ error: "User not found" });
  }
});

const resetPasswordSchema = z.object({ password: z.string().min(8) });

router.post("/users/:id/reset-password", requireAuth, requireRole(UserRole.ADMIN), async (req: AuthedRequest, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Password must be at least 8 characters" });

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash } });
    await logAudit({
      userId: req.user!.id,
      action: "user.password_reset",
      entityType: "user",
      entityId: req.params.id,
    });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "User not found" });
  }
});

// A logged-in user changing their own password (any role).
const changeOwnPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.post("/me/change-password", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = changeOwnPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await logAudit({ userId: user.id, action: "user.password_changed", entityType: "user", entityId: user.id });
  res.json({ ok: true });
});

router.get("/technicians", requireAuth, async (_req, res) => {
  const technicians = await prisma.user.findMany({
    where: { roles: { has: UserRole.TECHNICIAN }, active: true },
    select: { id: true, firstName: true, lastName: true, phone: true, email: true },
    orderBy: { firstName: "asc" },
  });
  res.json(technicians);
});

export default router;
