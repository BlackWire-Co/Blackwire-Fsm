import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requirePortalAuth, PortalRequest } from "../middleware/portalAuth";
import { generateDocumentPdf } from "../lib/pdf";
import { computeTotals } from "../lib/money";
import { approveEstimateById } from "../lib/estimateApproval";
import { getPaymentProvider } from "../lib/paymentProvider";
import { uploadBuffer, getSignedDownloadUrl } from "../lib/storage";
import { getSettings } from "../lib/settings";

const router = Router();
router.use(requirePortalAuth);

// --- Jobs (upcoming + past appointments, service history) ---
// Internal notes and material/labor costs are never exposed here — only
// what the spec calls "customer-visible" fields.
router.get("/jobs", async (req: PortalRequest, res) => {
  const jobs = await prisma.job.findMany({
    where: { customerId: req.customer!.customerId },
    select: {
      id: true, jobNumber: true, title: true, customerVisibleNotes: true,
      status: true, scheduledDate: true, startTime: true, endTime: true,
      property: { select: { label: true, addressLine1: true, city: true, state: true } },
      technicians: { select: { user: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: { scheduledDate: "desc" },
  });
  res.json(jobs);
});

router.get("/jobs/:id", async (req: PortalRequest, res) => {
  const job = await prisma.job.findFirst({
    where: { id: req.params.id, customerId: req.customer!.customerId },
    select: {
      id: true, jobNumber: true, title: true, description: true, customerVisibleNotes: true,
      status: true, scheduledDate: true, startTime: true, endTime: true,
      property: { select: { label: true, addressLine1: true, city: true, state: true, zip: true } },
      technicians: { select: { user: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!job) return res.status(404).json({ error: "Not found" });
  res.json(job);
});

// --- Estimates ---
const estimateInclude = {
  property: true,
  items: { orderBy: { sortOrder: "asc" as const } },
};

router.get("/estimates", async (req: PortalRequest, res) => {
  const estimates = await prisma.estimate.findMany({
    where: { customerId: req.customer!.customerId, status: { not: "DRAFT" } },
    include: estimateInclude,
    orderBy: { createdAt: "desc" },
  });
  res.json(estimates.map((e) => ({ ...e, totals: computeTotals(e.items, e.taxRate, e.discount) })));
});

router.get("/estimates/:id", async (req: PortalRequest, res) => {
  const estimate = await prisma.estimate.findFirst({
    where: { id: req.params.id, customerId: req.customer!.customerId, status: { not: "DRAFT" } },
    include: estimateInclude,
  });
  if (!estimate) return res.status(404).json({ error: "Not found" });
  res.json({ ...estimate, totals: computeTotals(estimate.items, estimate.taxRate, estimate.discount) });
});

const approveSchema = z.object({ signerName: z.string().min(1) });

router.post("/estimates/:id/approve", async (req: PortalRequest, res) => {
  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Your name is required to approve" });

  const estimate = await prisma.estimate.findFirst({
    where: { id: req.params.id, customerId: req.customer!.customerId },
  });
  if (!estimate) return res.status(404).json({ error: "Not found" });
  if (!["SENT", "VIEWED"].includes(estimate.status)) {
    return res.status(400).json({ error: "This estimate can't be approved from its current status" });
  }

  const updated = await approveEstimateById({
    estimateId: estimate.id,
    approvedByName: parsed.data.signerName,
    ip: req.ip,
  });
  res.json(updated);
});

router.post("/estimates/:id/decline", async (req: PortalRequest, res) => {
  const estimate = await prisma.estimate.findFirst({ where: { id: req.params.id, customerId: req.customer!.customerId } });
  if (!estimate) return res.status(404).json({ error: "Not found" });

  const updated = await prisma.estimate.update({
    where: { id: estimate.id },
    data: { status: "DECLINED", declinedAt: new Date() },
  });
  res.json(updated);
});

router.get("/estimates/:id/pdf", async (req: PortalRequest, res) => {
  const estimate = await prisma.estimate.findFirst({
    where: { id: req.params.id, customerId: req.customer!.customerId },
    include: { ...estimateInclude, customer: true },
  });
  if (!estimate) return res.status(404).json({ error: "Not found" });

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
  res.send(pdf);
});

// --- Invoices ---
const invoiceInclude = {
  property: true,
  items: { orderBy: { sortOrder: "asc" as const } },
  payments: { orderBy: { paidAt: "desc" as const } },
  job: { select: { title: true } },
};

function withInvoiceTotals(inv: any) {
  const totals = computeTotals(inv.items, inv.taxRate, inv.discount);
  const paid = inv.payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  return { ...inv, totals: { ...totals, paid, balance: totals.total - paid } };
}

router.get("/invoices", async (req: PortalRequest, res) => {
  const invoices = await prisma.invoice.findMany({
    where: { customerId: req.customer!.customerId, status: { not: "DRAFT" } },
    include: invoiceInclude,
    orderBy: { createdAt: "desc" },
  });
  res.json(invoices.map(withInvoiceTotals));
});

router.get("/invoices/:id", async (req: PortalRequest, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, customerId: req.customer!.customerId, status: { not: "DRAFT" } },
    include: invoiceInclude,
  });
  if (!invoice) return res.status(404).json({ error: "Not found" });
  res.json(withInvoiceTotals(invoice));
});

router.get("/invoices/:id/pdf", async (req: PortalRequest, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, customerId: req.customer!.customerId },
    include: { ...invoiceInclude, customer: true },
  });
  if (!invoice) return res.status(404).json({ error: "Not found" });

  const signature = invoice.jobId
    ? await prisma.signature.findFirst({ where: { jobId: invoice.jobId }, orderBy: { signedAt: "desc" } })
    : null;
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
  res.send(pdf);
});

// "Pay Invoice" never fakes a charge. With no processor configured (the
// default), it lets the customer know and drops a message into the office
// inbox instead, so a human follows up — matches the architecture note that
// Stripe (or anything else) is optional, not required for the app to work.
router.post("/invoices/:id/pay", async (req: PortalRequest, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, customerId: req.customer!.customerId },
    include: invoiceInclude,
  });
  if (!invoice) return res.status(404).json({ error: "Not found" });

  const totals = withInvoiceTotals(invoice).totals;
  const provider = getPaymentProvider();
  const session = await provider.createCheckoutSession({
    invoiceId: invoice.id,
    amountCents: Math.round(totals.balance * 100),
    description: `Invoice ${invoice.invoiceNumber}`,
  });

  if (session) {
    return res.json({ redirectUrl: session.url });
  }

  await prisma.customerMessage.create({
    data: {
      customerId: req.customer!.customerId,
      fromCustomer: true,
      body: `I'd like to pay invoice ${invoice.invoiceNumber} (balance: $${totals.balance.toFixed(2)}). Online payment isn't set up yet — please follow up with me.`,
    },
  });

  res.json({ redirectUrl: null, message: "Online payment isn't set up yet. We've let the office know — they'll follow up with you shortly." });
});

// --- Messages (communicate with the contractor) ---
router.get("/messages", async (req: PortalRequest, res) => {
  const messages = await prisma.customerMessage.findMany({
    where: { customerId: req.customer!.customerId },
    orderBy: { createdAt: "asc" },
  });
  res.json(messages);
});

const messageSchema = z.object({ body: z.string().min(1).max(4000) });

router.post("/messages", async (req: PortalRequest, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Message can't be empty" });

  const message = await prisma.customerMessage.create({
    data: { customerId: req.customer!.customerId, fromCustomer: true, body: parsed.data.body },
  });
  res.status(201).json(message);
});

// --- Documents (upload requested photos/documents) ---
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.get("/documents", async (req: PortalRequest, res) => {
  const docs = await prisma.customerDocument.findMany({
    where: { customerId: req.customer!.customerId },
    orderBy: { uploadedAt: "desc" },
  });
  const withUrls = await Promise.all(docs.map(async (d) => ({ ...d, url: await getSignedDownloadUrl(d.storageKey) })));
  res.json(withUrls);
});

router.post("/documents", upload.single("file"), async (req: PortalRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided (field name: file)" });

  try {
    const storageKey = await uploadBuffer({
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
      prefix: `customers/${req.customer!.customerId}/documents`,
    });
    const doc = await prisma.customerDocument.create({
      data: { customerId: req.customer!.customerId, fileName: req.file.originalname, storageKey },
    });
    res.status(201).json({ ...doc, url: await getSignedDownloadUrl(storageKey) });
  } catch (err: any) {
    res.status(502).json({ error: `Could not store file: ${err.message}` });
  }
});

export default router;
