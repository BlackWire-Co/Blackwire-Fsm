import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { UserRole } from "@prisma/client";
import { logAudit } from "../lib/audit";
import { ensureBookingSettings } from "../lib/booking";

// Admin-only configuration for the public booking page: global rules,
// the service catalog, who's bookable, and everyone's hours/breaks/time off.
const router = Router();
router.use(requireAuth, requireRole(UserRole.ADMIN));

// --- Settings ---

router.get("/settings", async (_req, res) => {
  res.json(await ensureBookingSettings());
});

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  timezone: z.string().min(1).optional(),
  arrivalWindowMin: z.number().int().min(0).optional(),
  bufferMin: z.number().int().min(0).optional(),
  minNoticeHours: z.number().int().min(0).optional(),
  maxAdvanceDays: z.number().int().min(1).optional(),
  slotIntervalMin: z.number().int().min(5).optional(),
  requireAddress: z.boolean().optional(),
  requirePhone: z.boolean().optional(),
  requireEmail: z.boolean().optional(),
  requireNotes: z.boolean().optional(),
  confirmationNote: z.string().optional(),
});

router.patch("/settings", async (req: AuthedRequest, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const before = await ensureBookingSettings();
  const settings = await prisma.bookingSettings.update({ where: { id: "singleton" }, data: parsed.data });

  // Flipping the public booking page on/off is significant enough (and
  // this bit has been mysteriously flipping unexpectedly) to leave a
  // visible trace in the server logs every time it changes, with who did
  // it and what was actually sent in the request body.
  if (before.enabled !== settings.enabled) {
    console.log(
      `[booking-admin] enabled changed ${before.enabled} -> ${settings.enabled} by user ${req.user!.id}; request body: ${JSON.stringify(req.body)}`
    );
  }

  await logAudit({ userId: req.user!.id, action: "booking_settings.modified", entityType: "booking_settings", entityId: "singleton" });
  res.json(settings);
});

// --- Services ---

router.get("/services", async (_req, res) => {
  const services = await prisma.bookingService.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  res.json(services);
});

const serviceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  durationMin: z.number().int().positive(),
  price: z.number().nonnegative(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.post("/services", async (req: AuthedRequest, res) => {
  const parsed = serviceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const service = await prisma.bookingService.create({ data: parsed.data });
  await logAudit({ userId: req.user!.id, action: "booking_service.created", entityType: "booking_service", entityId: service.id });
  res.status(201).json(service);
});

router.patch("/services/:id", async (req: AuthedRequest, res) => {
  const parsed = serviceSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const service = await prisma.bookingService.update({ where: { id: req.params.id }, data: parsed.data });
    await logAudit({ userId: req.user!.id, action: "booking_service.modified", entityType: "booking_service", entityId: service.id });
    res.json(service);
  } catch {
    res.status(404).json({ error: "Service not found" });
  }
});

router.delete("/services/:id", async (req: AuthedRequest, res) => {
  try {
    await prisma.bookingService.delete({ where: { id: req.params.id } });
    await logAudit({ userId: req.user!.id, action: "booking_service.deleted", entityType: "booking_service", entityId: req.params.id });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Service not found" });
  }
});

// --- Providers ---
// Deliberately simple, per the "just assign anyone until we figure out a
// decent system" instruction: any active user can be flagged bookable,
// regardless of role.

router.get("/providers", async (_req, res) => {
  const [users, providers] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, firstName: true, lastName: true, roles: true },
      orderBy: { firstName: "asc" },
    }),
    prisma.bookingProvider.findMany(),
  ]);
  const byUserId = new Map(providers.map((p) => [p.userId, p]));
  res.json(users.map((u) => ({ user: u, provider: byUserId.get(u.id) || null })));
});

router.post("/providers", async (req: AuthedRequest, res) => {
  const parsed = z.object({ userId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "userId is required" });

  const existing = await prisma.bookingProvider.findUnique({ where: { userId: parsed.data.userId } });
  if (existing) {
    const provider = await prisma.bookingProvider.update({ where: { userId: parsed.data.userId }, data: { active: true } });
    return res.json(provider);
  }
  const provider = await prisma.bookingProvider.create({ data: { userId: parsed.data.userId } });
  await logAudit({ userId: req.user!.id, action: "booking_provider.created", entityType: "booking_provider", entityId: provider.id });
  res.status(201).json(provider);
});

router.patch("/providers/:id", async (req: AuthedRequest, res) => {
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "active must be a boolean" });
  try {
    const provider = await prisma.bookingProvider.update({ where: { id: req.params.id }, data: { active: parsed.data.active } });
    await logAudit({ userId: req.user!.id, action: "booking_provider.modified", entityType: "booking_provider", entityId: provider.id });
    res.json(provider);
  } catch {
    res.status(404).json({ error: "Provider not found" });
  }
});

// --- Per-provider weekly availability ---

const availabilitySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
});

router.get("/providers/:id/availability", async (req, res) => {
  const rows = await prisma.bookingAvailability.findMany({
    where: { providerId: req.params.id },
    orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
  });
  res.json(rows);
});

router.post("/providers/:id/availability", async (req, res) => {
  const parsed = availabilitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.endMinute <= parsed.data.startMinute) return res.status(400).json({ error: "End time must be after start time" });
  const row = await prisma.bookingAvailability.create({ data: { providerId: req.params.id, ...parsed.data } });
  res.status(201).json(row);
});

router.delete("/providers/:id/availability/:rowId", async (req, res) => {
  try {
    await prisma.bookingAvailability.delete({ where: { id: req.params.rowId } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

// --- Per-provider breaks (recurring) ---

const breakSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
  label: z.string().optional(),
});

router.get("/providers/:id/breaks", async (req, res) => {
  const rows = await prisma.bookingBreak.findMany({ where: { providerId: req.params.id } });
  res.json(rows);
});

router.post("/providers/:id/breaks", async (req, res) => {
  const parsed = breakSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.endMinute <= parsed.data.startMinute) return res.status(400).json({ error: "End time must be after start time" });
  const row = await prisma.bookingBreak.create({ data: { providerId: req.params.id, ...parsed.data } });
  res.status(201).json(row);
});

router.delete("/providers/:id/breaks/:rowId", async (req, res) => {
  try {
    await prisma.bookingBreak.delete({ where: { id: req.params.rowId } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

// --- One-off blocks (per-provider, or company-wide when providerId is null) ---

const blockSchema = z.object({
  providerId: z.string().nullable().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  label: z.string().optional(),
});

router.get("/blocks", async (_req, res) => {
  const rows = await prisma.bookingBlock.findMany({ orderBy: { startAt: "desc" } });
  res.json(rows);
});

router.post("/blocks", async (req: AuthedRequest, res) => {
  const parsed = blockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (new Date(parsed.data.endAt) <= new Date(parsed.data.startAt)) return res.status(400).json({ error: "End must be after start" });
  const row = await prisma.bookingBlock.create({ data: parsed.data });
  await logAudit({ userId: req.user!.id, action: "booking_block.created", entityType: "booking_block", entityId: row.id });
  res.status(201).json(row);
});

router.delete("/blocks/:id", async (req: AuthedRequest, res) => {
  try {
    await prisma.bookingBlock.delete({ where: { id: req.params.id } });
    await logAudit({ userId: req.user!.id, action: "booking_block.deleted", entityType: "booking_block", entityId: req.params.id });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

export default router;
