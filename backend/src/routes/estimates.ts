import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { UserRole, EstimateStatus, JobStatus } from "@prisma/client";
import { logAudit } from "../lib/audit";
import { nextEstimateNumber } from "../lib/numbering";
import { computeTotals } from "../lib/money";
import { generateDocumentPdf } from "../lib/pdf";
import { notifyCustomer } from "../lib/notify";
import { getSettings } from "../lib/settings";
import { parsePagination } from "../lib/pagination";

const router = Router();
router.use(requireAuth);

const itemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  taxable: z.boolean().optional(),
});

const estimateSchema = z.object({
  customerId: z.string().uuid(),
  propertyId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  expirationDate: z.string().datetime().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  discount: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  terms: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

const include = {
  customer: { select: { id: true, firstName: true, lastName: true, companyName: true, phone: true, email: true, mobilePhone: true, preferredContactMethod: true } },
  property: true,
  job: { select: { id: true, jobNumber: true, title: true } },
  items: { orderBy: { sortOrder: "asc" as const } },
};

function withTotals(estimate: any) {
  return { ...estimate, totals: computeTotals(estimate.items, estimate.taxRate, estimate.discount) };
}

router.get("/", async (req, res) => {
  const { status, customerId } = req.query as Record<string, string | undefined>;
  const { page, pageSize, skip, take } = parsePagination(req);
  const where: any = {};
  if (status) where.status = { in: status.split(",") as EstimateStatus[] };
  if (customerId) where.customerId = customerId;

  const [items, total] = await Promise.all([
    prisma.estimate.findMany({ where, include, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.estimate.count({ where }),
  ]);
  res.json({ items: items.map(withTotals), total, page, pageSize });
});

router.get("/:id", async (req, res) => {
  const estimate = await prisma.estimate.findUnique({ where: { id: req.params.id }, include });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  res.json(withTotals(estimate));
});

router.post("/", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const parsed = estimateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { items, jobId, ...rest } = parsed.data;
  const estimateNumber = await nextEstimateNumber();

  const estimate = await prisma.estimate.create({
    data: {
      ...rest,
      jobId,
      estimateNumber,
      items: { create: items.map((item, i) => ({ ...item, sortOrder: i })) },
    },
    include,
  });

  await logAudit({ userId: req.user!.id, action: "estimate.created", entityType: "estimate", entityId: estimate.id });
  res.status(201).json(withTotals(estimate));
});

router.patch("/:id", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const parsed = estimateSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.estimate.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Estimate not found" });
  if (existing.status !== EstimateStatus.DRAFT) {
    return res.status(400).json({ error: "Only draft estimates can be edited. Create a new one instead." });
  }

  const { items, ...rest } = parsed.data;

  const estimate = await prisma.$transaction(async (tx: any) => {
    if (items) {
      await tx.estimateItem.deleteMany({ where: { estimateId: req.params.id } });
      await tx.estimateItem.createMany({
        data: items.map((item, i) => ({ ...item, estimateId: req.params.id, sortOrder: i })),
      });
    }
    return tx.estimate.update({ where: { id: req.params.id }, data: rest, include });
  });

  await logAudit({ userId: req.user!.id, action: "estimate.modified", entityType: "estimate", entityId: estimate.id });
  res.json(withTotals(estimate));
});

router.post("/:id/send", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  try {
    const estimate = await prisma.estimate.update({
      where: { id: req.params.id },
      data: { status: EstimateStatus.SENT, sentAt: new Date() },
      include,
    });
    await logAudit({ userId: req.user!.id, action: "estimate.sent", entityType: "estimate", entityId: estimate.id });
    res.json(withTotals(estimate));
  } catch {
    res.status(404).json({ error: "Estimate not found" });
  }
});

// Explicit, opt-in email — separate from "Mark as Sent" so marking an
// estimate sent doesn't silently fire an email every time. Staff choose
// when to actually notify the customer.
router.post("/:id/notify", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const estimate = await prisma.estimate.findUnique({ where: { id: req.params.id }, include });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });

  const totals = computeTotals(estimate.items, estimate.taxRate, estimate.discount);
  await notifyCustomer({
    templateKey: "ESTIMATE_READY",
    customer: estimate.customer,
    variables: { estimateNumber: estimate.estimateNumber, total: `$${totals.total.toFixed(2)}` },
    relatedType: "estimate",
    relatedId: estimate.id,
  });

  res.json({ ok: true });
});

const approveSchema = z.object({ approvedByName: z.string().min(1) });

// Any authenticated role can capture an approval (e.g. a technician getting
// verbal/in-person sign-off on-site). The customer-portal self-service
// approval flow (Phase 5) will call this same endpoint without requireAuth,
// recording IP/device info per the spec.
router.post("/:id/approve", async (req: AuthedRequest, res) => {
  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "approvedByName is required" });

  try {
    const estimate = await prisma.estimate.update({
      where: { id: req.params.id },
      data: {
        status: EstimateStatus.APPROVED,
        approvedAt: new Date(),
        approvedByName: parsed.data.approvedByName,
        approvalIp: req.ip,
      },
      include,
    });

    if (estimate.jobId) {
      await prisma.job.update({ where: { id: estimate.jobId }, data: { status: JobStatus.SCHEDULED } }).catch(() => {});
    }

    await logAudit({
      userId: req.user?.id,
      action: "estimate.approved",
      entityType: "estimate",
      entityId: estimate.id,
      metadata: { approvedByName: parsed.data.approvedByName },
    });

    res.json(withTotals(estimate));
  } catch {
    res.status(404).json({ error: "Estimate not found" });
  }
});

router.post("/:id/decline", async (req: AuthedRequest, res) => {
  try {
    const estimate = await prisma.estimate.update({
      where: { id: req.params.id },
      data: { status: EstimateStatus.DECLINED, declinedAt: new Date() },
      include,
    });
    await logAudit({ userId: req.user?.id, action: "estimate.declined", entityType: "estimate", entityId: estimate.id });
    res.json(withTotals(estimate));
  } catch {
    res.status(404).json({ error: "Estimate not found" });
  }
});

// Sends a sent/viewed/declined estimate back to DRAFT so line items can be
// edited and re-sent. Approved estimates are a record of what the customer
// agreed to and can't be silently rewritten — decline it first (or create a
// new estimate) if the approved terms genuinely need to change.
router.post("/:id/reopen", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const existing = await prisma.estimate.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Estimate not found" });
  if (existing.status === EstimateStatus.APPROVED) {
    return res.status(400).json({ error: "Approved estimates can't be reopened — decline it first if terms need to change, or create a new estimate." });
  }

  const estimate = await prisma.estimate.update({
    where: { id: req.params.id },
    data: { status: EstimateStatus.DRAFT, sentAt: null, viewedAt: null, declinedAt: null },
    include,
  });
  await logAudit({ userId: req.user!.id, action: "estimate.reopened", entityType: "estimate", entityId: estimate.id });
  res.json(withTotals(estimate));
});

router.get("/:id/pdf", async (req, res) => {
  const estimate = await prisma.estimate.findUnique({ where: { id: req.params.id }, include });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });

  const settings = await getSettings();
  const pdf = await generateDocumentPdf({
    kind: "ESTIMATE",
    number: estimate.estimateNumber,
    date: estimate.date,
    dueOrExpiration: estimate.expirationDate,
    status: estimate.status,
    customer: estimate.customer,
    property: estimate.property,
    items: estimate.items,
    taxRate: estimate.taxRate,
    discount: estimate.discount,
    notes: estimate.notes,
    terms: estimate.terms,
    company: { name: settings.companyName, address: settings.companyAddress, phone: settings.companyPhone, email: settings.companyEmail },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${estimate.estimateNumber}.pdf"`);
  res.send(pdf);
});

export default router;
