import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest, isPureTechnician } from "../middleware/auth";
import { SignatureType } from "@prisma/client";
import { logAudit } from "../lib/audit";

const router = Router({ mergeParams: true });
router.use(requireAuth);

const signatureSchema = z.object({
  type: z.nativeEnum(SignatureType),
  signerName: z.string().min(1),
  imageData: z.string().min(1), // base64 PNG data URL from the canvas
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

  const signatures = await prisma.signature.findMany({ where: { jobId: req.params.jobId } });
  res.json(signatures);
});

router.post("/", async (req: AuthedRequest, res) => {
  const access = await assertJobAccess(req, req.params.jobId);
  if (!access.ok) return res.status(access.code).json({ error: "Not found or not permitted" });

  const parsed = signatureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const signature = await prisma.signature.create({
    data: {
      jobId: req.params.jobId,
      type: parsed.data.type,
      signerName: parsed.data.signerName,
      imageData: parsed.data.imageData,
      ipAddress: req.ip,
    },
  });

  await logAudit({
    userId: req.user!.id,
    action: "job.signature_captured",
    entityType: "job",
    entityId: req.params.jobId,
    metadata: { signatureId: signature.id, type: signature.type },
  });

  res.status(201).json(signature);
});

export default router;
