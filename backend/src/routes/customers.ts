import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { UserRole, CustomerStatus, PreferredContactMethod } from "@prisma/client";
import { logAudit } from "../lib/audit";
import { notifyCustomer } from "../lib/notify";
import { getSignedDownloadUrl } from "../lib/storage";
import { parsePagination } from "../lib/pagination";
import { toCsv, parseCsv } from "../lib/csv";

const router = Router();
router.use(requireAuth);

const customerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  companyName: z.string().optional(),
  phone: z.string().optional(),
  mobilePhone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  preferredContactMethod: z.nativeEnum(PreferredContactMethod).optional(),
  notes: z.string().optional(),
  billingAddressLine1: z.string().optional(),
  billingAddressLine2: z.string().optional(),
  billingCity: z.string().optional(),
  billingState: z.string().optional(),
  billingZip: z.string().optional(),
  status: z.nativeEnum(CustomerStatus).optional(),
  tags: z.array(z.string()).optional(),
});

// List + global-ish search (name, phone, email). Office/Admin/Technician can all
// look up a customer; sensitive accounting data is not exposed here.
router.get("/", async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const includeArchived = req.query.includeArchived === "true";
  const { page, pageSize, skip, take } = parsePagination(req);

  const where: any = includeArchived ? {} : { status: { not: CustomerStatus.ARCHIVED } };
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { companyName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { mobilePhone: { contains: q } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { properties: { select: { id: true, label: true, city: true, state: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip,
      take,
    }),
    prisma.customer.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
});

// --- CSV export/import ---
// Kept intentionally simple: one row per customer, with optional columns to
// also create that customer's first property in the same pass (useful when
// migrating from another platform where "customer" and "job site" are often
// the same record). Existing customers are never updated by import — only
// new ones are created — to avoid an import silently overwriting hand-edited
// data.

const CUSTOMER_EXPORT_COLUMNS = [
  "firstName", "lastName", "companyName", "phone", "mobilePhone", "email",
  "preferredContactMethod", "billingAddressLine1", "billingAddressLine2",
  "billingCity", "billingState", "billingZip", "status", "notes", "tags",
];

router.get("/export.csv", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (_req, res) => {
  const customers = await prisma.customer.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
  const rows = customers.map((c) => ({ ...c, tags: c.tags.join(";") }));
  const csv = toCsv(rows, CUSTOMER_EXPORT_COLUMNS);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="customers.csv"');
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
    const rowNum = i + 2; // +1 for header row, +1 for 1-indexing
    if (!row.firstName?.trim() || !row.lastName?.trim()) {
      errors.push(`Row ${rowNum}: firstName and lastName are required`);
      continue;
    }
    try {
      const customer = await prisma.customer.create({
        data: {
          firstName: row.firstName.trim(),
          lastName: row.lastName.trim(),
          companyName: row.companyName || undefined,
          phone: row.phone || undefined,
          mobilePhone: row.mobilePhone || undefined,
          email: row.email || undefined,
          billingAddressLine1: row.billingAddressLine1 || undefined,
          billingAddressLine2: row.billingAddressLine2 || undefined,
          billingCity: row.billingCity || undefined,
          billingState: row.billingState || undefined,
          billingZip: row.billingZip || undefined,
          notes: row.notes || undefined,
          tags: row.tags ? row.tags.split(";").map((t) => t.trim()).filter(Boolean) : undefined,
        },
      });

      // Optional: also create a property if address columns are present,
      // so a single-row-per-job-site export from another platform can be
      // imported without a second pass.
      if (row.propertyAddressLine1?.trim()) {
        await prisma.property.create({
          data: {
            customerId: customer.id,
            label: row.propertyLabel?.trim() || "Main",
            addressLine1: row.propertyAddressLine1.trim(),
            city: row.propertyCity?.trim() || row.billingCity?.trim() || "",
            state: row.propertyState?.trim() || row.billingState?.trim() || "",
            zip: row.propertyZip?.trim() || row.billingZip?.trim() || "",
          },
        });
      }

      created++;
    } catch (err: any) {
      errors.push(`Row ${rowNum}: ${err.message}`);
    }
  }

  await logAudit({ userId: req.user!.id, action: "customer.imported", entityType: "customer", metadata: { created, errorCount: errors.length } });
  res.json({ created, errors });
});

router.get("/:id", async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: {
      properties: true,
      jobs: {
        orderBy: { createdAt: "desc" },
        include: { property: { select: { label: true } } },
      },
    },
  });
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json(customer);
});

router.post("/", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data = { ...parsed.data, email: parsed.data.email || undefined };
  const customer = await prisma.customer.create({ data });

  await logAudit({
    userId: req.user!.id,
    action: "customer.created",
    entityType: "customer",
    entityId: customer.id,
  });

  res.status(201).json(customer);
});

router.patch("/:id", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const parsed = customerSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data = { ...parsed.data, email: parsed.data.email || undefined };

  try {
    const customer = await prisma.customer.update({ where: { id: req.params.id }, data });
    await logAudit({
      userId: req.user!.id,
      action: "customer.modified",
      entityType: "customer",
      entityId: customer.id,
    });
    res.json(customer);
  } catch {
    res.status(404).json({ error: "Customer not found" });
  }
});

// Customers are archived, never hard-deleted — a customer's jobs, invoices,
// and history stay intact for accounting and audit purposes. Archived
// customers are excluded from the default list view (see GET / below if you
// add a status filter later) but remain reachable by direct link.
router.post("/:id/archive", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  try {
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: { status: CustomerStatus.ARCHIVED },
    });
    await logAudit({
      userId: req.user!.id,
      action: "customer.archived",
      entityType: "customer",
      entityId: customer.id,
    });
    res.json(customer);
  } catch {
    res.status(404).json({ error: "Customer not found" });
  }
});

router.post("/:id/unarchive", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  try {
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: { status: CustomerStatus.ACTIVE },
    });
    await logAudit({
      userId: req.user!.id,
      action: "customer.unarchived",
      entityType: "customer",
      entityId: customer.id,
    });
    res.json(customer);
  } catch {
    res.status(404).json({ error: "Customer not found" });
  }
});

// Sends the customer a portal invite link so they can set their own
// password and log in. Requires an email on file. Safe to call again to
// resend / re-invite (issues a fresh token, invalidating any prior link).
router.post("/:id/portal-invite", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  if (!customer.email) return res.status(400).json({ error: "This customer has no email on file" });

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

  await prisma.customer.update({
    where: { id: customer.id },
    data: { portalInviteToken: token, portalInviteExpires: expires },
  });

  const portalUrl = `${process.env.PUBLIC_APP_URL || "http://localhost:8080"}/portal/accept-invite?token=${token}`;

  await notifyCustomer({
    templateKey: "CUSTOMER_PORTAL_INVITE",
    customer,
    variables: { portalUrl },
    relatedType: "customer",
    relatedId: customer.id,
  });

  await logAudit({ userId: req.user!.id, action: "customer.portal_invited", entityType: "customer", entityId: customer.id });

  res.json({ ok: true, expiresAt: expires });
});

router.get("/:id/documents", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const docs = await prisma.customerDocument.findMany({
    where: { customerId: req.params.id },
    orderBy: { uploadedAt: "desc" },
  });
  const withUrls = await Promise.all(docs.map(async (d) => ({ ...d, url: await getSignedDownloadUrl(d.storageKey) })));
  res.json(withUrls);
});

router.get("/:id/messages", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const messages = await prisma.customerMessage.findMany({
    where: { customerId: req.params.id },
    orderBy: { createdAt: "asc" },
  });
  // Mark customer-sent messages as read now that staff has viewed the thread.
  await prisma.customerMessage.updateMany({
    where: { customerId: req.params.id, fromCustomer: true, readAt: null },
    data: { readAt: new Date() },
  });
  res.json(messages);
});

const replySchema = z.object({ body: z.string().min(1).max(4000) });

router.post("/:id/messages", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const parsed = replySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Message can't be empty" });

  const message = await prisma.customerMessage.create({
    data: { customerId: req.params.id, fromCustomer: false, body: parsed.data.body },
  });
  res.status(201).json(message);
});

export default router;
