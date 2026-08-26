import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { UserRole } from "@prisma/client";
import { getSettings } from "../lib/settings";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth, requireRole(UserRole.ADMIN));

router.get("/", async (_req, res) => {
  const settings = await getSettings();
  res.json(settings);
});

const updateSchema = z.object({
  companyName: z.string().min(1).optional(),
  companyAddress: z.string().optional(),
  companyPhone: z.string().optional(),
  companyEmail: z.string().optional(),
  defaultLaborRate: z.number().nonnegative().optional(),
  defaultTaxRate: z.number().min(0).max(100).optional(),
  jobNumberPrefix: z.string().min(1).max(10).optional(),
  estimateNumberPrefix: z.string().min(1).max(10).optional(),
  invoiceNumberPrefix: z.string().min(1).max(10).optional(),
  autoSendReminders: z.boolean().optional(),
  reminderHoursBefore: z.number().int().min(1).max(168).optional(),
});

router.patch("/", async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await getSettings(); // ensure the row exists before updating it
  const settings = await prisma.appSettings.update({ where: { id: "singleton" }, data: parsed.data });

  await logAudit({ userId: req.user!.id, action: "settings.modified", entityType: "settings", entityId: "singleton" });
  res.json(settings);
});

export default router;
