import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { UserRole, InvoiceStatus, JobStatus } from "@prisma/client";
import { logAudit } from "../lib/audit";
import { nextInvoiceNumber } from "../lib/numbering";
import { computeTotals } from "../lib/money";
import { generateDocumentPdf } from "../lib/pdf";
import { notifyCustomer } from "../lib/notify";
import { getSettings } from "../lib/settings";
import { parsePagination } from "../lib/pagination";
import { toCsv } from "../lib/csv";

const router = Router();
router.use(requireAuth);

const itemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  taxable: z.boolean().optional(),
});

const invoiceSchema = z.object({
  customerId: z.string().uuid(),
  propertyId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  estimateId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
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
  payments: { orderBy: { paidAt: "desc" as const } },
};

function withTotals(invoice: any) {
  const totals = computeTotals(invoice.items, invoice.taxRate, invoice.discount);
  const paid = invoice.payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  return { ...invoice, totals: { ...totals, paid: Math.round(paid * 100) / 100, balance: Math.round((totals.total - paid) * 100) / 100 } };
}

router.get("/", async (req, res) => {
  const { status, customerId } = req.query as Record<string, string | undefined>;
  const { page, pageSize, skip, take } = parsePagination(req);
  const where: any = {};
  if (status) where.status = { in: status.split(",") as InvoiceStatus[] };
  if (customerId) where.customerId = customerId;

  const [items, total] = await Promise.all([
    prisma.invoice.findMany({ where, include, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.invoice.count({ where }),
  ]);
  res.json({ items: items.map(withTotals), total, page, pageSize });
});

// Export only — invoice import is intentionally not offered. Estimates/
// invoices carry real accounting history (payments, balances), and a wrong
// or partial CSV import could quietly corrupt someone's books. Exporting
// existing data is safe; recreating financial records from a spreadsheet
// is not something to do without a human reviewing every row.
router.get("/export.csv", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (_req, res) => {
  const invoices = await prisma.invoice.findMany({
    include: { customer: true, items: true, payments: true },
    orderBy: { createdAt: "desc" },
  });
  const rows = invoices.map((inv) => {
    const totals = computeTotals(inv.items, inv.taxRate, inv.discount);
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    return {
      invoiceNumber: inv.invoiceNumber,
      customerName: `${inv.customer.firstName} ${inv.customer.lastName}`,
      customerEmail: inv.customer.email || "",
      date: inv.date.toISOString(),
      dueDate: inv.dueDate ? inv.dueDate.toISOString() : "",
      status: inv.status,
      subtotal: totals.subtotal.toFixed(2),
      tax: totals.tax.toFixed(2),
      discount: totals.discount.toFixed(2),
      total: totals.total.toFixed(2),
      paid: paid.toFixed(2),
      balance: (totals.total - paid).toFixed(2),
    };
  });
  const csv = toCsv(rows, ["invoiceNumber", "customerName", "customerEmail", "date", "dueDate", "status", "subtotal", "tax", "discount", "total", "paid", "balance"]);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="invoices.csv"');
  res.send(csv);
});

router.get("/:id", async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, include });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  res.json(withTotals(invoice));
});

async function createInvoice(req: AuthedRequest, res: any, data: z.infer<typeof invoiceSchema>) {
  const { items, jobId, estimateId, ...rest } = data;
  const invoiceNumber = await nextInvoiceNumber();

  const invoice = await prisma.invoice.create({
    data: {
      ...rest,
      jobId,
      estimateId,
      invoiceNumber,
      status: InvoiceStatus.DRAFT,
      items: { create: items.map((item, i) => ({ ...item, sortOrder: i })) },
    },
    include,
  });

  if (jobId) {
    await prisma.job.update({ where: { id: jobId }, data: { status: JobStatus.INVOICED } }).catch(() => {});
  }

  await logAudit({ userId: req.user!.id, action: "invoice.created", entityType: "invoice", entityId: invoice.id });
  return invoice;
}

router.post("/", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const parsed = invoiceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const invoice = await createInvoice(req, res, parsed.data);
  res.status(201).json(withTotals(invoice));
});

// Convenience endpoint: build an invoice's line items automatically from a
// job's logged materials and time entries, so office staff don't have to
// retype what a technician already recorded in the field.
router.post("/from-job/:jobId", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const job = await prisma.job.findUnique({
    where: { id: req.params.jobId },
    include: { materials: true, timeEntries: true },
  });
  if (!job) return res.status(404).json({ error: "Job not found" });

  const settings = await getSettings();
  const laborRate = Number(settings.defaultLaborRate);
  const items: z.infer<typeof itemSchema>[] = [];

  for (const m of job.materials) {
    items.push({
      description: m.name,
      quantity: Number(m.quantity),
      unitPrice: Number(m.salePrice),
      taxable: m.taxable,
    });
  }

  const billableMinutes = job.timeEntries
    .filter((t) => t.endedAt)
    .reduce((sum, t) => sum + (t.endedAt!.getTime() - t.startedAt.getTime()) / 60000, 0);
  if (billableMinutes > 0) {
    items.push({
      description: "Labor",
      quantity: Math.round((billableMinutes / 60) * 100) / 100,
      unitPrice: laborRate,
      taxable: false,
    });
  }

  if (items.length === 0) {
    items.push({ description: job.title, quantity: 1, unitPrice: 0, taxable: false });
  }

  const invoice = await createInvoice(req, res, {
    customerId: job.customerId,
    propertyId: job.propertyId,
    jobId: job.id,
    items,
  });

  res.status(201).json(withTotals(invoice));
});

router.patch("/:id", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const parsed = invoiceSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Invoice not found" });
  if (existing.status !== InvoiceStatus.DRAFT) {
    return res.status(400).json({ error: "Only draft invoices can be edited" });
  }

  const { items, ...rest } = parsed.data;

  const invoice = await prisma.$transaction(async (tx: any) => {
    if (items) {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: req.params.id } });
      await tx.invoiceItem.createMany({
        data: items.map((item, i) => ({ ...item, invoiceId: req.params.id, sortOrder: i })),
      });
    }
    return tx.invoice.update({ where: { id: req.params.id }, data: rest, include });
  });

  await logAudit({ userId: req.user!.id, action: "invoice.modified", entityType: "invoice", entityId: invoice.id });
  res.json(withTotals(invoice));
});

router.post("/:id/send", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  try {
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: InvoiceStatus.SENT, sentAt: new Date() },
      include,
    });
    await logAudit({ userId: req.user!.id, action: "invoice.sent", entityType: "invoice", entityId: invoice.id });
    res.json(withTotals(invoice));
  } catch {
    res.status(404).json({ error: "Invoice not found" });
  }
});

// Explicit, opt-in email — separate from "Mark as Sent" and from recording
// a payment, so those actions don't silently fire an email every time.
router.post("/:id/notify", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const templateKey = req.body.templateKey === "PAYMENT_RECEIPT" ? "PAYMENT_RECEIPT" : "INVOICE_READY";
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, include });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  const totals = computeTotals(invoice.items, invoice.taxRate, invoice.discount);

  if (templateKey === "PAYMENT_RECEIPT") {
    const latestPayment = invoice.payments[0];
    if (!latestPayment) return res.status(400).json({ error: "No payments recorded on this invoice yet" });
    await notifyCustomer({
      templateKey: "PAYMENT_RECEIPT",
      customer: invoice.customer,
      variables: { invoiceNumber: invoice.invoiceNumber, amount: `$${Number(latestPayment.amount).toFixed(2)}` },
      relatedType: "invoice",
      relatedId: invoice.id,
    });
  } else {
    await notifyCustomer({
      templateKey: "INVOICE_READY",
      customer: invoice.customer,
      variables: {
        invoiceNumber: invoice.invoiceNumber,
        jobTitle: invoice.job?.title || "your service",
        total: `$${totals.total.toFixed(2)}`,
        dueDate: invoice.dueDate ? ` (due ${invoice.dueDate.toLocaleDateString()})` : "",
      },
      relatedType: "invoice",
      relatedId: invoice.id,
    });
  }

  res.json({ ok: true });
});

router.post("/:id/void", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  try {
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: InvoiceStatus.VOID },
      include,
    });
    await logAudit({ userId: req.user!.id, action: "invoice.voided", entityType: "invoice", entityId: invoice.id });
    res.json(withTotals(invoice));
  } catch {
    res.status(404).json({ error: "Invoice not found" });
  }
});

// Sends a sent invoice back to DRAFT so line items can be corrected and
// re-sent. Blocked once any payment has been recorded — at that point the
// invoice is part of the accounting trail; void it and issue a new one
// instead of rewriting history.
router.post("/:id/reopen", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const existing = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { payments: true } });
  if (!existing) return res.status(404).json({ error: "Invoice not found" });
  if (existing.payments.length > 0) {
    return res.status(400).json({ error: "This invoice has payments recorded and can't be reopened. Void it and create a corrected invoice instead." });
  }
  if (existing.status === InvoiceStatus.VOID) {
    return res.status(400).json({ error: "Voided invoices can't be reopened. Create a new invoice instead." });
  }

  const invoice = await prisma.invoice.update({
    where: { id: req.params.id },
    data: { status: InvoiceStatus.DRAFT, sentAt: null },
    include,
  });
  await logAudit({ userId: req.user!.id, action: "invoice.reopened", entityType: "invoice", entityId: invoice.id });
  res.json(withTotals(invoice));
});

router.get("/:id/pdf", async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, include });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  // Pull the most recent signature captured on the linked job, if any, so a
  // technician's completion/authorization signature shows up on the invoice
  // without office staff having to do anything extra.
  let signature = null;
  if (invoice.jobId) {
    signature = await prisma.signature.findFirst({
      where: { jobId: invoice.jobId },
      orderBy: { signedAt: "desc" },
    });
  }

  const settings = await getSettings();
  const pdf = await generateDocumentPdf({
    kind: "INVOICE",
    number: invoice.invoiceNumber,
    date: invoice.date,
    dueOrExpiration: invoice.dueDate,
    status: invoice.status,
    customer: invoice.customer,
    property: invoice.property,
    items: invoice.items,
    taxRate: invoice.taxRate,
    discount: invoice.discount,
    notes: invoice.notes,
    terms: invoice.terms,
    payments: invoice.payments,
    signature: signature
      ? { imageData: signature.imageData, signerName: signature.signerName, signedAt: signature.signedAt, type: signature.type }
      : undefined,
    company: { name: settings.companyName, address: settings.companyAddress, phone: settings.companyPhone, email: settings.companyEmail },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${invoice.invoiceNumber}.pdf"`);
  res.send(pdf);
});

export default router;
