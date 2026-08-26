import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest, isPureTechnician } from "../middleware/auth";
import { JobStatus, UserRole, EstimateStatus, InvoiceStatus } from "@prisma/client";
import { computeTotals } from "../lib/money";

const router = Router();
router.use(requireAuth);

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// Phase 1: jobs-and-scheduling facts only. Estimates/invoices widgets
// activate once Phase 3 routes exist; kept as empty arrays for now so the
// frontend contract doesn't have to change later.
router.get("/", async (req: AuthedRequest, res) => {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const technicianFilter =
    isPureTechnician(req.user!.roles) ? { technicians: { some: { userId: req.user!.id } } } : {};

  const [todaysJobs, upcomingJobs, unassignedJobs, needsAttention, recentCustomers, estimatesAwaitingApproval, unpaidInvoices, overdueInvoices] = await Promise.all([
    prisma.job.findMany({
      where: { ...technicianFilter, scheduledDate: { gte: todayStart, lte: todayEnd } },
      include: {
        customer: { select: { firstName: true, lastName: true } },
        property: { select: { addressLine1: true, city: true } },
        technicians: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.job.findMany({
      where: { ...technicianFilter, scheduledDate: { gt: todayEnd } },
      include: { customer: { select: { firstName: true, lastName: true } } },
      orderBy: { scheduledDate: "asc" },
      take: 10,
    }),
    prisma.job.findMany({
      where: { technicians: { none: {} }, status: { notIn: [JobStatus.COMPLETED, JobStatus.CANCELLED, JobStatus.PAID] } },
      include: { customer: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.job.findMany({
      where: { ...technicianFilter, status: JobStatus.AWAITING_PARTS },
      include: { customer: { select: { firstName: true, lastName: true } } },
      take: 10,
    }),
    prisma.customer.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.estimate.findMany({
      where: { status: { in: [EstimateStatus.SENT, EstimateStatus.VIEWED] } },
      include: { customer: { select: { firstName: true, lastName: true } }, items: true },
      orderBy: { sentAt: "asc" },
      take: 10,
    }),
    prisma.invoice.findMany({
      where: { status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] } },
      include: { customer: { select: { firstName: true, lastName: true } }, items: true, payments: true },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    prisma.invoice.findMany({
      where: { status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.VOID, InvoiceStatus.DRAFT] }, dueDate: { lt: now } },
      include: { customer: { select: { firstName: true, lastName: true } }, items: true, payments: true },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
  ]);

  const withInvoiceTotals = (inv: any) => {
    const totals = computeTotals(inv.items, inv.taxRate, inv.discount);
    const paid = inv.payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
    return { ...inv, totals: { ...totals, paid, balance: totals.total - paid } };
  };
  const withEstimateTotals = (est: any) => ({ ...est, totals: computeTotals(est.items, est.taxRate, est.discount) });

  res.json({
    todaysJobs,
    upcomingJobs,
    unassignedJobs,
    needsAttention,
    recentCustomers,
    estimatesAwaitingApproval: estimatesAwaitingApproval.map(withEstimateTotals),
    unpaidInvoices: unpaidInvoices.map(withInvoiceTotals),
    overdueInvoices: overdueInvoices.map(withInvoiceTotals),
  });
});

export default router;
