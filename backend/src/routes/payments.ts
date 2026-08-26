import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { UserRole, PaymentMethod, InvoiceStatus, JobStatus } from "@prisma/client";
import { logAudit } from "../lib/audit";
import { computeTotals } from "../lib/money";

const router = Router({ mergeParams: true });
router.use(requireAuth);

const paymentSchema = z.object({
  method: z.nativeEnum(PaymentMethod),
  amount: z.number().positive(),
  notes: z.string().optional(),
  paidAt: z.string().datetime().optional(),
});

// Recomputes and persists an invoice's status from its items and payments.
// Called after every payment change so status never drifts out of sync.
async function reconcileInvoiceStatus(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: true, payments: true },
  });
  if (!invoice || invoice.status === InvoiceStatus.VOID) return;

  const totals = computeTotals(invoice.items, invoice.taxRate, invoice.discount);
  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);

  let status: InvoiceStatus = invoice.status;
  if (paid <= 0) {
    status = invoice.status === InvoiceStatus.DRAFT ? InvoiceStatus.DRAFT : InvoiceStatus.SENT;
  } else if (paid < totals.total) {
    status = InvoiceStatus.PARTIALLY_PAID;
  } else {
    status = InvoiceStatus.PAID;
  }

  await prisma.invoice.update({ where: { id: invoiceId }, data: { status } });

  if (status === InvoiceStatus.PAID && invoice.jobId) {
    await prisma.job.update({ where: { id: invoice.jobId }, data: { status: JobStatus.PAID } }).catch(() => {});
  }
}

router.get("/", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req, res) => {
  const payments = await prisma.payment.findMany({
    where: { invoiceId: req.params.invoiceId },
    orderBy: { paidAt: "desc" },
  });
  res.json(payments);
});

router.post("/", requireRole(UserRole.ADMIN, UserRole.OFFICE), async (req: AuthedRequest, res) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.invoiceId } });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  if (invoice.status === InvoiceStatus.VOID) return res.status(400).json({ error: "Cannot record payment on a voided invoice" });

  const payment = await prisma.payment.create({
    data: {
      invoiceId: req.params.invoiceId,
      method: parsed.data.method,
      amount: parsed.data.amount,
      notes: parsed.data.notes,
      paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : undefined,
      recordedById: req.user!.id,
    },
  });

  await reconcileInvoiceStatus(req.params.invoiceId);

  await logAudit({
    userId: req.user!.id,
    action: "payment.recorded",
    entityType: "invoice",
    entityId: req.params.invoiceId,
    metadata: { paymentId: payment.id, amount: parsed.data.amount, method: parsed.data.method },
  });

  res.status(201).json(payment);
});

router.delete("/:paymentId", requireRole(UserRole.ADMIN), async (req: AuthedRequest, res) => {
  try {
    await prisma.payment.delete({ where: { id: req.params.paymentId } });
    await reconcileInvoiceStatus(req.params.invoiceId);
    await logAudit({
      userId: req.user!.id,
      action: "payment.deleted",
      entityType: "invoice",
      entityId: req.params.invoiceId,
      metadata: { paymentId: req.params.paymentId },
    });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Payment not found" });
  }
});

export default router;
