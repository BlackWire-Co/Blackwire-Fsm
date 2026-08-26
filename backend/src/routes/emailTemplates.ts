import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { UserRole } from "@prisma/client";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth, requireRole(UserRole.ADMIN));

router.get("/", async (_req, res) => {
  const templates = await prisma.emailTemplate.findMany({ orderBy: { name: "asc" } });
  res.json(templates);
});

const updateSchema = z.object({
  subject: z.string().min(1).optional(),
  bodyHtml: z.string().min(1).optional(),
  bodyText: z.string().optional(),
});

router.patch("/:key", async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const template = await prisma.emailTemplate.update({ where: { key: req.params.key }, data: parsed.data });
    await logAudit({ userId: req.user!.id, action: "email_template.modified", entityType: "emailTemplate", entityId: template.id });
    res.json(template);
  } catch {
    res.status(404).json({ error: "Template not found" });
  }
});

export default router;
