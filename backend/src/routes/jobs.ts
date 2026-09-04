import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedRequest, isPureTechnician } from "../middleware/auth";
import { UserRole, JobStatus, JobPriority, RecurrenceInterval } from "@prisma/client";
import { logAudit } from "../lib/audit";
import { nextJobNumber } from "../lib/numbering";
import { notifyCustomer } from "../lib/notify";
import { addInterval as addRecurrenceInterval } from "../lib/scheduler";
import { parsePagination } from "../lib/pagination";
import { toCsv, parseCsv } from "../lib/csv";

const router = Router();
router.use(requireAuth);

const jobSchema = z.object({
  customerId: z.string().uuid(),
  propertyId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  problemRequest: z.string().optional(),
  priority: z.nativeEnum(JobPriority).optional(),
  scheduledDate: z.string().datetime().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  estimatedDurationMin: z.number().int().positive().optional(),
  internalNotes: z.string().optional(),
  customerVisibleNotes: z.string().optional(),
  technicianIds: z.array(z.string().uuid()).optional(),
  recurrenceInterval: z.nativeEnum(RecurrenceInterval).optional(),
});

const jobInclude = {
  customer: { select: { id: true, firstName: true, lastName: true, companyName: true, phone: true, email: true, mobilePhone: true, preferredContactMethod: true } },
  property: true,
  technicians: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
} as const;

// Named sort presets for the Jobs list. "recent" (newest created first) is
// the default - before this, the list only ever ordered by scheduled date
// ascending, which effectively buried anything you just created or worked
// today at the bottom (or wherever it fell relative to old scheduled dates)
// instead of showing recent activity up top. "scheduled" preserves that
// original ordering for anyone who specifically wants the upcoming queue.
const JOB_SORTS: Record<string, any> = {
  recent: [{ createdAt: "desc" }],
  oldest: [{ createdAt: "asc" }],
  scheduled: [{ scheduledDate: "asc" }, { startTime: "asc" }],
};

// GET /jobs supports the dashboard + schedule views via query params:
//   ?status=NEW,NEEDS_SCHEDULING   ?technicianId=...   ?from=...&to=...   ?unassigned=true
//   ?sort=recent|oldest|scheduled  (defaults to "recent" - see JOB_SORTS above)
router.get("/", async (req: AuthedRequest, res) => {
  const { status, technicianId, from, to, unassigned, sort } = req.query as Record<string, string | undefined>;
  const { page, pageSize, skip, take } = parsePagination(req, 50, 500);
  const orderBy = JOB_SORTS[sort || ""] || JOB_SORTS.recent;

  const where: any = {};
  if (status) where.status = { in: status.split(",") as JobStatus[] };
  if (from || to) {
    where.scheduledDate = {};
    if (from) where.scheduledDate.gte = new Date(from);
    if (to) where.scheduledDate.lte = new Date(to);
  }
  if (unassigned === "true") where.technicians = { none: {} };
  if (technicianId) where.technicians = { some: { userId: technicianId } };

  // Technicians only see their own assigned jobs, regardless of filters passed.
  if (isPureTechnician(req.user!.roles)) {
    where.technicians = { some: { userId: req.user!.id } };
  }

  const [items, total] = await Promise.all([
    prisma.job.findMany({
      where,
      include: jobInclude,
      orderBy,
      skip,
      take,
    }),
    prisma.job.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
});

// --- CSV export/import ---
// Import matches an existing customer by email and either matches an
// existing property by address or creates a new one - jobs are never
// imported without a resolvable customer, since an orphaned job would be
// invisible everywhere in the app that scopes by customer.

const JOB_EXPORT_COLUMNS = [
  "jobNumber", "customerName", "customerEmail", "propertyAddress",
  "title", "description", "priority", "status", "scheduledDate",
];

router.get("/export.csv", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (_req, res) => {
  const jobs = await prisma.job.findMany({
    include: { customer: true, property: true },
    orderBy: { createdAt: "desc" },
  });
  const rows = jobs.map((j) => ({
    jobNumber: j.jobNumber,
    customerName: `${j.customer.firstName} ${j.customer.lastName}`,
    customerEmail: j.customer.email || "",
    propertyAddress: `${j.property.addressLine1}, ${j.property.city}, ${j.property.state} ${j.property.zip}`,
    title: j.title,
    description: j.description || "",
    priority: j.priority,
    status: j.status,
    scheduledDate: j.scheduledDate ? j.scheduledDate.toISOString() : "",
  }));
  const csv = toCsv(rows, JOB_EXPORT_COLUMNS);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="jobs.csv"');
  res.send(csv);
});

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post("/import", requireRole(UserRole.ADMIN, UserRole.OFFICE), csvUpload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided (field name: file)" });

  const { rows, parseErrors } = parseCsv(req.file.buffer);
  const errors: string[] = [...parseErrors];
  let created = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    if (!row.customerEmail?.trim() || !row.title?.trim()) {
      errors.push(`Row ${rowNum}: customerEmail and title are required`);
      continue;
    }

    const customer = await prisma.customer.findFirst({
      where: { email: row.customerEmail.trim() },
      include: { properties: true },
    });
    if (!customer) {
      errors.push(`Row ${rowNum}: no customer found with email ${row.customerEmail}`);
      continue;
    }

    let property = customer.properties[0];
    if (row.propertyAddressLine1?.trim()) {
      const match = customer.properties.find(
        (p) => p.addressLine1.toLowerCase() === row.propertyAddressLine1!.trim().toLowerCase()
      );
      property = match || (await prisma.property.create({
        data: {
          customerId: customer.id,
          label: row.propertyLabel?.trim() || "Imported",
          addressLine1: row.propertyAddressLine1.trim(),
          city: row.propertyCity?.trim() || "",
          state: row.propertyState?.trim() || "",
          zip: row.propertyZip?.trim() || "",
        },
      }));
    }
    if (!property) {
      errors.push(`Row ${rowNum}: customer ${row.customerEmail} has no property on file and none was provided in the CSV`);
      continue;
    }

    try {
      const jobNumber = await nextJobNumber();
      const scheduledDate = row.scheduledDate?.trim() ? new Date(row.scheduledDate.trim()) : undefined;
      await prisma.job.create({
        data: {
          jobNumber,
          customerId: customer.id,
          propertyId: property.id,
          title: row.title.trim(),
          description: row.description || undefined,
          priority: (Object.values(JobPriority) as string[]).includes(row.priority) ? (row.priority as JobPriority) : JobPriority.NORMAL,
          status: (Object.values(JobStatus) as string[]).includes(row.status) ? (row.status as JobStatus) : (scheduledDate ? JobStatus.SCHEDULED : JobStatus.NEEDS_SCHEDULING),
          scheduledDate,
        },
      });
      created++;
    } catch (err: any) {
      errors.push(`Row ${rowNum}: ${err.message}`);
    }
  }

  await logAudit({ userId: req.user!.id, action: "job.imported", entityType: "job", metadata: { created, errorCount: errors.length } });
  res.json({ created, errors });
});

router.get("/:id", async (req: AuthedRequest, res) => {
  const job = await prisma.job.findUnique({
    where: { id: req.params.id },
    include: {
      ...jobInclude,
      statusHistory: { orderBy: { changedAt: "desc" } },
      materials: true,
      timeEntries: { include: { user: { select: { firstName: true, lastName: true } } }, orderBy: { startedAt: "desc" } },
      signatures: true,
      estimates: { select: { id: true, estimateNumber: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } },
      invoices: { select: { id: true, invoiceNumber: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!job) return res.status(404).json({ error: "Job not found" });

  if (isPureTechnician(req.user!.roles)) {
    const assigned = job.technicians.some((t) => t.userId === req.user!.id);
    if (!assigned) return res.status(403).json({ error: "Not assigned to this job" });
  }

  res.json(job);
});

router.post("/", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const parsed = jobSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { technicianIds, ...rest } = parsed.data;
  const jobNumber = await nextJobNumber();

  const job = await prisma.job.create({
    data: {
      ...rest,
      jobNumber,
      status: rest.scheduledDate ? JobStatus.SCHEDULED : JobStatus.NEEDS_SCHEDULING,
      technicians: technicianIds?.length
        ? { create: technicianIds.map((userId) => ({ userId })) }
        : undefined,
      statusHistory: {
        create: { status: rest.scheduledDate ? JobStatus.SCHEDULED : JobStatus.NEEDS_SCHEDULING, changedBy: req.user!.id },
      },
    },
    include: jobInclude,
  });

  await logAudit({ userId: req.user!.id, action: "job.created", entityType: "job", entityId: job.id });

  res.status(201).json(job);
});

router.patch("/:id", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const parsed = jobSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { technicianIds, ...rest } = parsed.data;
  const data: any = { ...rest };

  // Setting a recurrence interval computes when the next occurrence should
  // be generated, based on this job's scheduled date. Clearing it (NONE)
  // stops future generation.
  if (rest.recurrenceInterval !== undefined) {
    if (rest.recurrenceInterval === RecurrenceInterval.NONE) {
      data.nextRecurrenceDate = null;
    } else {
      const existing = await prisma.job.findUnique({ where: { id: req.params.id }, select: { scheduledDate: true } });
      const baseline = rest.scheduledDate ? new Date(rest.scheduledDate) : existing?.scheduledDate;
      if (!baseline) {
        return res.status(400).json({ error: "This job needs a scheduled date before recurrence can be set" });
      }
      data.nextRecurrenceDate = addRecurrenceInterval(baseline, rest.recurrenceInterval);
    }
  }

  try {
    const job = await prisma.$transaction(async (tx) => {
      if (technicianIds) {
        await tx.jobTechnician.deleteMany({ where: { jobId: req.params.id } });
        if (technicianIds.length) {
          await tx.jobTechnician.createMany({
            data: technicianIds.map((userId) => ({ jobId: req.params.id, userId })),
          });
        }
        await logAudit({
          userId: req.user!.id,
          action: "job.assigned",
          entityType: "job",
          entityId: req.params.id,
          metadata: { technicianIds },
        });
      }

      return tx.job.update({
        where: { id: req.params.id },
        data,
        include: jobInclude,
      });
    });

    await logAudit({ userId: req.user!.id, action: "job.modified", entityType: "job", entityId: job.id });
    res.json(job);
  } catch {
    res.status(404).json({ error: "Job not found" });
  }
});

const statusSchema = z.object({ status: z.nativeEnum(JobStatus), note: z.string().optional() });

// Technicians use this to move a job through its lifecycle from the mobile UI
// (En Route / Arrived / Start Work / Complete Job map to statuses here).
router.post("/:id/status", async (req: AuthedRequest, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const job = await prisma.job.findUnique({
    where: { id: req.params.id },
    include: { technicians: true },
  });
  if (!job) return res.status(404).json({ error: "Job not found" });

  if (isPureTechnician(req.user!.roles)) {
    const assigned = job.technicians.some((t) => t.userId === req.user!.id);
    if (!assigned) return res.status(403).json({ error: "Not assigned to this job" });
  }

  const updated = await prisma.job.update({
    where: { id: req.params.id },
    data: {
      status: parsed.data.status,
      statusHistory: {
        create: { status: parsed.data.status, changedBy: req.user!.id, note: parsed.data.note },
      },
    },
    include: jobInclude,
  });

  await logAudit({
    userId: req.user!.id,
    action: "job.status_changed",
    entityType: "job",
    entityId: job.id,
    metadata: { status: parsed.data.status },
  });

  res.json(updated);
});

// Manual notification triggers. Notifications are opt-in per action rather
// than automatic on every status change - a solo operator changing a job's
// status ten times a day shouldn't mean ten emails to the customer. Office
// or admin sends exactly when they mean to.
const JOB_NOTIFY_TEMPLATES = ["APPOINTMENT_CONFIRMATION", "APPOINTMENT_REMINDER", "TECHNICIAN_EN_ROUTE", "JOB_COMPLETION"] as const;

router.post("/:id/notify", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const templateKey = req.body.templateKey as (typeof JOB_NOTIFY_TEMPLATES)[number];
  if (!JOB_NOTIFY_TEMPLATES.includes(templateKey)) {
    return res.status(400).json({ error: `templateKey must be one of: ${JOB_NOTIFY_TEMPLATES.join(", ")}` });
  }

  const job = await prisma.job.findUnique({ where: { id: req.params.id }, include: jobInclude });
  if (!job) return res.status(404).json({ error: "Job not found" });

  if ((templateKey === "APPOINTMENT_CONFIRMATION" || templateKey === "APPOINTMENT_REMINDER") && !job.scheduledDate) {
    return res.status(400).json({ error: "This job isn't scheduled yet" });
  }

  const address = `${job.property.addressLine1}, ${job.property.city}, ${job.property.state}`;
  await notifyCustomer({
    templateKey,
    customer: job.customer,
    variables: {
      jobTitle: job.title,
      address,
      scheduledDate: job.scheduledDate ? job.scheduledDate.toLocaleString() : "",
    },
    relatedType: "job",
    relatedId: job.id,
  });

  res.json({ ok: true });
});

export default router;
