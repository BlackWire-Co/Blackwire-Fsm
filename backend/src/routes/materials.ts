import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest, isPureTechnician } from "../middleware/auth";
import { logAudit } from "../lib/audit";

const router = Router({ mergeParams: true });
router.use(requireAuth);

const materialSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  description: z.string().optional(),
  cost: z.number().nonnegative(),
  salePrice: z.number().nonnegative(),
  taxable: z.boolean().optional(),
  quantity: z.number().positive().optional(),
});

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

  const materials = await prisma.jobMaterial.findMany({ where: { jobId: req.params.jobId } });
  res.json(materials);
});

// Technicians can add materials directly from the mobile job screen; office/admin can too.
router.post("/", async (req: AuthedRequest, res) => {
  const access = await assertJobAccess(req, req.params.jobId);
  if (!access.ok) return res.status(access.code).json({ error: "Not found or not permitted" });

  const parsed = materialSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const material = await prisma.jobMaterial.create({
    data: { ...parsed.data, jobId: req.params.jobId },
  });

  await logAudit({
    userId: req.user!.id,
    action: "job.material_added",
    entityType: "job",
    entityId: req.params.jobId,
    metadata: { materialId: material.id, name: material.name },
  });

  res.status(201).json(material);
});

router.delete("/:materialId", async (req: AuthedRequest, res) => {
  const access = await assertJobAccess(req, req.params.jobId);
  if (!access.ok) return res.status(access.code).json({ error: "Not found or not permitted" });

  try {
    await prisma.jobMaterial.delete({ where: { id: req.params.materialId } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Material not found" });
  }
});

export default router;
