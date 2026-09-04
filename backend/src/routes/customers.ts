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

const contactInclude = {
  phones: { orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }] },
  emails: { orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }] },
};

// Keeps the legacy customers.phone / customers.mobilePhone columns in sync
// with the customer_phones table, so notify.ts, CSV export, and search
// (which all read those columns directly) don't need to change. `phone`
// mirrors whichever row is isPrimary; `mobilePhone` mirrors whichever row
// is labeled "Mobile" (case-insensitive) regardless of which one is
// primary, since notify.ts specifically prefers mobilePhone for SMS.
async function syncPhoneMirror(customerId: string) {
  const phones = await prisma.customerPhone.findMany({ where: { customerId }, orderBy: { createdAt: "asc" } });
  const primary = phones.find((p) => p.isPrimary) || phones[0];
  const mobile = phones.find((p) => p.label.trim().toLowerCase() === "mobile");
  await prisma.customer.update({
    where: { id: customerId },
    data: { phone: primary?.number ?? null, mobilePhone: mobile?.number ?? null },
  });
}

async function syncEmailMirror(customerId: string) {
  const emails = await prisma.customerEmail.findMany({ where: { customerId }, orderBy: { createdAt: "asc" } });
  const primary = emails.find((e) => e.isPrimary) || emails[0];
  await prisma.customer.update({ where: { id: customerId }, data: { email: primary?.address ?? null } });
}

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
      // Also match any non-primary phone/email a customer might have on
      // file (e.g. a work number), not just the legacy mirrored columns.
      { phones: { some: { number: { contains: q } } } },
      { emails: { some: { address: { contains: q, mode: "insensitive" } } } },
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
// the same record). Existing customers are never updated by import - only
// new ones are created - to avoid an import silently overwriting hand-edited
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

      // Mirror any imported phone/email into the new multi-contact tables
      // too, so an imported customer isn't missing from them.
      if (row.phone) {
        await prisma.customerPhone.create({ data: { customerId: customer.id, label: "Phone", number: row.phone, isPrimary: true } });
      }
      if (row.mobilePhone) {
        await prisma.customerPhone.create({ data: { customerId: customer.id, label: "Mobile", number: row.mobilePhone, isPrimary: !row.phone } });
      }
      if (row.email) {
        await prisma.customerEmail.create({ data: { customerId: customer.id, label: "Primary", address: row.email, isPrimary: true } });
      }

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
      ...contactInclude,
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

  // Seed the new multi-contact tables from whatever was entered in the
  // create-customer form, so a brand-new customer already has proper rows
  // instead of only the legacy columns.
  if (data.phone) {
    await prisma.customerPhone.create({ data: { customerId: customer.id, label: "Phone", number: data.phone, isPrimary: true } });
  }
  if (data.mobilePhone) {
    await prisma.customerPhone.create({ data: { customerId: customer.id, label: "Mobile", number: data.mobilePhone, isPrimary: !data.phone } });
  }
  if (data.email) {
    await prisma.customerEmail.create({ data: { customerId: customer.id, label: "Primary", address: data.email, isPrimary: true } });
  }

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

  // phone/mobilePhone/email are derived from the customer_phones /
  // customer_emails tables now (see the /phones and /emails routes below)
  // - edits to them here would just get overwritten on the next sync, so
  // they're dropped from this endpoint rather than silently ignored.
  const { phone, mobilePhone, email, ...rest } = parsed.data;
  const data = { ...rest };

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

// --- Multiple phone numbers per customer ---
// Replaces the old "one phone + one mobilePhone" limit. Add as many labeled
// numbers as needed (Mobile, Home, Work, Office, ...); exactly one can be
// marked primary at a time, and it's what shows up first / gets used as
// "the" phone number elsewhere in the app.

const phoneSchema = z.object({
  label: z.string().trim().min(1).max(30).optional(),
  number: z.string().trim().min(1),
  isPrimary: z.boolean().optional(),
});

router.post("/:id/phones", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const parsed = phoneSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const existingCount = await prisma.customerPhone.count({ where: { customerId: req.params.id } });
  const makePrimary = parsed.data.isPrimary || existingCount === 0;

  await prisma.$transaction(async (tx) => {
    if (makePrimary) {
      await tx.customerPhone.updateMany({ where: { customerId: req.params.id }, data: { isPrimary: false } });
    }
    await tx.customerPhone.create({
      data: {
        customerId: req.params.id,
        label: parsed.data.label || "Mobile",
        number: parsed.data.number,
        isPrimary: makePrimary,
      },
    });
  });
  await syncPhoneMirror(req.params.id);

  await logAudit({ userId: req.user!.id, action: "customer.phone_added", entityType: "customer", entityId: req.params.id });

  const customerWithContacts = await prisma.customer.findUnique({ where: { id: req.params.id }, include: contactInclude });
  res.status(201).json(customerWithContacts);
});

router.patch("/:id/phones/:phoneId", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const parsed = phoneSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.customerPhone.findFirst({ where: { id: req.params.phoneId, customerId: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Phone number not found" });

  await prisma.$transaction(async (tx) => {
    if (parsed.data.isPrimary) {
      await tx.customerPhone.updateMany({ where: { customerId: req.params.id }, data: { isPrimary: false } });
    }
    await tx.customerPhone.update({
      where: { id: req.params.phoneId },
      data: {
        label: parsed.data.label,
        number: parsed.data.number,
        isPrimary: parsed.data.isPrimary,
      },
    });
  });
  await syncPhoneMirror(req.params.id);

  await logAudit({ userId: req.user!.id, action: "customer.phone_modified", entityType: "customer", entityId: req.params.id });

  const customerWithContacts = await prisma.customer.findUnique({ where: { id: req.params.id }, include: contactInclude });
  res.json(customerWithContacts);
});

router.delete("/:id/phones/:phoneId", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const existing = await prisma.customerPhone.findFirst({ where: { id: req.params.phoneId, customerId: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Phone number not found" });

  await prisma.customerPhone.delete({ where: { id: req.params.phoneId } });

  // If the deleted number was primary and others remain, promote the
  // oldest remaining one so the customer always has a primary phone when
  // they have any phone at all.
  if (existing.isPrimary) {
    const next = await prisma.customerPhone.findFirst({ where: { customerId: req.params.id }, orderBy: { createdAt: "asc" } });
    if (next) await prisma.customerPhone.update({ where: { id: next.id }, data: { isPrimary: true } });
  }
  await syncPhoneMirror(req.params.id);

  await logAudit({ userId: req.user!.id, action: "customer.phone_deleted", entityType: "customer", entityId: req.params.id });

  const customerWithContacts = await prisma.customer.findUnique({ where: { id: req.params.id }, include: contactInclude });
  res.json(customerWithContacts);
});

// --- Multiple email addresses per customer --- (mirrors the phone routes above)

const emailSchema = z.object({
  label: z.string().trim().min(1).max(30).optional(),
  address: z.string().trim().email(),
  isPrimary: z.boolean().optional(),
});

router.post("/:id/emails", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const parsed = emailSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const existingCount = await prisma.customerEmail.count({ where: { customerId: req.params.id } });
  const makePrimary = parsed.data.isPrimary || existingCount === 0;

  await prisma.$transaction(async (tx) => {
    if (makePrimary) {
      await tx.customerEmail.updateMany({ where: { customerId: req.params.id }, data: { isPrimary: false } });
    }
    await tx.customerEmail.create({
      data: {
        customerId: req.params.id,
        label: parsed.data.label || "Primary",
        address: parsed.data.address,
        isPrimary: makePrimary,
      },
    });
  });
  await syncEmailMirror(req.params.id);

  await logAudit({ userId: req.user!.id, action: "customer.email_added", entityType: "customer", entityId: req.params.id });

  const customerWithContacts = await prisma.customer.findUnique({ where: { id: req.params.id }, include: contactInclude });
  res.status(201).json(customerWithContacts);
});

router.patch("/:id/emails/:emailId", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const parsed = emailSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.customerEmail.findFirst({ where: { id: req.params.emailId, customerId: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Email address not found" });

  await prisma.$transaction(async (tx) => {
    if (parsed.data.isPrimary) {
      await tx.customerEmail.updateMany({ where: { customerId: req.params.id }, data: { isPrimary: false } });
    }
    await tx.customerEmail.update({
      where: { id: req.params.emailId },
      data: {
        label: parsed.data.label,
        address: parsed.data.address,
        isPrimary: parsed.data.isPrimary,
      },
    });
  });
  await syncEmailMirror(req.params.id);

  await logAudit({ userId: req.user!.id, action: "customer.email_modified", entityType: "customer", entityId: req.params.id });

  const customerWithContacts = await prisma.customer.findUnique({ where: { id: req.params.id }, include: contactInclude });
  res.json(customerWithContacts);
});

router.delete("/:id/emails/:emailId", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const existing = await prisma.customerEmail.findFirst({ where: { id: req.params.emailId, customerId: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Email address not found" });

  await prisma.customerEmail.delete({ where: { id: req.params.emailId } });

  if (existing.isPrimary) {
    const next = await prisma.customerEmail.findFirst({ where: { customerId: req.params.id }, orderBy: { createdAt: "asc" } });
    if (next) await prisma.customerEmail.update({ where: { id: next.id }, data: { isPrimary: true } });
  }
  await syncEmailMirror(req.params.id);

  await logAudit({ userId: req.user!.id, action: "customer.email_deleted", entityType: "customer", entityId: req.params.id });

  const customerWithContacts = await prisma.customer.findUnique({ where: { id: req.params.id }, include: contactInclude });
  res.json(customerWithContacts);
});

// Customers are archived, never hard-deleted - a customer's jobs, invoices,
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
