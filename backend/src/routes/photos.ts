import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest, isPureTechnician } from "../middleware/auth";
import { uploadBuffer, getSignedDownloadUrl } from "../lib/storage";
import { logAudit } from "../lib/audit";

const router = Router({ mergeParams: true });
router.use(requireAuth);

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB per photo
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("Unsupported file type. Use JPG, PNG, WEBP, or HEIC."));
    }
    cb(null, true);
  },
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

  const photos = await prisma.jobPhoto.findMany({
    where: { jobId: req.params.jobId },
    orderBy: { uploadedAt: "desc" },
  });

  const withUrls = await Promise.all(
    photos.map(async (p) => ({ ...p, url: await getSignedDownloadUrl(p.storageKey) }))
  );

  res.json(withUrls);
});

const categorySchema = z.enum(["before", "during", "after", "general"]);

router.post("/", upload.single("photo"), async (req: AuthedRequest, res) => {
  const access = await assertJobAccess(req, req.params.jobId);
  if (!access.ok) return res.status(access.code).json({ error: "Not found or not permitted" });

  if (!req.file) return res.status(400).json({ error: "No photo file provided (field name: photo)" });

  const categoryParsed = categorySchema.safeParse(req.body.category || "general");
  const category = categoryParsed.success ? categoryParsed.data : "general";

  try {
    const storageKey = await uploadBuffer({
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
      prefix: `jobs/${req.params.jobId}/photos`,
    });

    const photo = await prisma.jobPhoto.create({
      data: {
        jobId: req.params.jobId,
        storageKey,
        category,
        uploadedById: req.user!.id,
      },
    });

    await logAudit({
      userId: req.user!.id,
      action: "job.photo_uploaded",
      entityType: "job",
      entityId: req.params.jobId,
      metadata: { photoId: photo.id, category },
    });

    const url = await getSignedDownloadUrl(storageKey);
    res.status(201).json({ ...photo, url });
  } catch (err: any) {
    // Storage may be unreachable (e.g. MinIO not configured yet); surface a
    // clear error rather than a generic 500.
    res.status(502).json({ error: `Could not store photo: ${err.message}` });
  }
});

export default router;
