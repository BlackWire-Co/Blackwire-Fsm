import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedRequest, isPureTechnician } from "../middleware/auth";
import { UserRole } from "@prisma/client";
import { logAudit } from "../lib/audit";

const router = Router({ mergeParams: true });
router.use(requireAuth);

async function assertJobAccess(req: AuthedRequest, jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { technicians: true } });
  if (!job) return { ok: false, code: 404 as const };
  if (isPureTechnician(req.user!.roles) && !job.technicians.some((t) => t.userId === req.user!.id)) {
    return { ok: false, code: 403 as const };
  }
  return { ok: true as const, job };
}

router.get("/", async (req: AuthedRequest, res) => {
  const access = await assertJobAccess(req, req.params.jobId);
  if (!access.ok) return res.status(access.code).json({ error: "Not found or not permitted" });

  const entries = await prisma.timeEntry.findMany({
    where: { jobId: req.params.jobId },
    include: { user: { select: { firstName: true, lastName: true } } },
    orderBy: { startedAt: "desc" },
  });
  res.json(entries);
});

// Start a timer. A technician can only start their own; office/admin can
// start on behalf of a technician by passing userId.
router.post("/start", async (req: AuthedRequest, res) => {
  const access = await assertJobAccess(req, req.params.jobId);
  if (!access.ok) return res.status(access.code).json({ error: "Not found or not permitted" });

  const userId = isPureTechnician(req.user!.roles) ? req.user!.id : (req.body.userId as string) || req.user!.id;

  const openEntry = await prisma.timeEntry.findFirst({
    where: { jobId: req.params.jobId, userId, endedAt: null },
  });
  if (openEntry) return res.status(409).json({ error: "A timer is already running for this job" });

  const entry = await prisma.timeEntry.create({
    data: { jobId: req.params.jobId, userId, startedAt: new Date() },
  });
  res.status(201).json(entry);
});

router.post("/:entryId/stop", async (req: AuthedRequest, res) => {
  const access = await assertJobAccess(req, req.params.jobId);
  if (!access.ok) return res.status(access.code).json({ error: "Not found or not permitted" });

  try {
    const entry = await prisma.timeEntry.update({
      where: { id: req.params.entryId },
      data: { endedAt: new Date() },
    });
    res.json(entry);
  } catch {
    res.status(404).json({ error: "Time entry not found" });
  }
});

const adjustSchema = z.object({
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().nullable().optional(),
  notes: z.string().optional(),
});

// Manual adjustment restricted to office/admin per spec ("authorized users").
router.patch("/:entryId", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const parsed = adjustSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const entry = await prisma.timeEntry.update({
      where: { id: req.params.entryId },
      data: parsed.data as any,
    });
    await logAudit({
      userId: req.user!.id,
      action: "job.time_entry_adjusted",
      entityType: "job",
      entityId: req.params.jobId,
      metadata: { entryId: entry.id },
    });
    res.json(entry);
  } catch {
    res.status(404).json({ error: "Time entry not found" });
  }
});

export default router;
