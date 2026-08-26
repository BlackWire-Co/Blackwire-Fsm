import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { UserRole, JobStatus, EstimateStatus, InvoiceStatus } from "@prisma/client";
import { computeTotals } from "../lib/money";

const router = Router();
router.use(requireAuth, requireRole(UserRole.ADMIN, UserRole.OFFICE));

function parseRange(req: any) {
  const to = req.query.to ? new Date(req.query.to as string) : new Date();
  const from = req.query.from
    ? new Date(req.query.from as string)
    : new Date(to.getFullYear(), to.getMonth() - 1, to.getDate()); // default: trailing 30 days
  return { from, to };
}

router.get("/summary", async (req, res) => {
  const { from, to } = parseRange(req);

  const [payments, invoices, jobsInRange, timeEntries, materials, estimatesInRange, users] = await Promise.all([
    prisma.payment.findMany({ where: { paidAt: { gte: from, lte: to } } }),
    prisma.invoice.findMany({
      where: { status: { notIn: [InvoiceStatus.DRAFT, InvoiceStatus.VOID] } },
      include: { items: true, payments: true },
    }),
    prisma.job.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: { technicians: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } },
    }),
    prisma.timeEntry.findMany({
      where: { startedAt: { gte: from, lte: to }, endedAt: { not: null } },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.jobMaterial.findMany({
      where: { job: { createdAt: { gte: from, lte: to } } },
      select: { name: true, quantity: true, salePrice: true },
    }),
    prisma.estimate.findMany({
      where: { createdAt: { gte: from, lte: to }, status: { in: [EstimateStatus.APPROVED, EstimateStatus.DECLINED] } },
      select: { status: true },
    }),
    prisma.user.findMany({ where: { roles: { has: UserRole.TECHNICIAN } }, select: { id: true, firstName: true, lastName: true } }),
  ]);

  // Revenue actually collected in range (cash-basis, from payments).
  const revenue = payments.reduce((s, p) => s + Number(p.amount), 0);

  // Outstanding vs paid across all non-draft/void invoices (not range-limited —
  // "what's currently owed" is a point-in-time fact, not a period total).
  let outstandingTotal = 0;
  let outstandingCount = 0;
  let paidCount = 0;
  const now = new Date();
  let overdueCount = 0;
  let overdueTotal = 0;
  for (const inv of invoices) {
    const totals = computeTotals(inv.items, inv.taxRate, inv.discount);
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    const balance = totals.total - paid;
    if (balance <= 0.005) {
      paidCount++;
    } else {
      outstandingTotal += balance;
      outstandingCount++;
      if (inv.dueDate && inv.dueDate < now) {
        overdueCount++;
        overdueTotal += balance;
      }
    }
  }

  const jobsCompleted = jobsInRange.filter((j) => j.status === JobStatus.COMPLETED || j.status === JobStatus.PAID).length;

  // Per-technician breakdown: jobs assigned + hours logged in range.
  const byTechnician = users.map((u) => {
    const jobCount = jobsInRange.filter((j) => j.technicians.some((t) => t.user.id === u.id)).length;
    const hours = timeEntries
      .filter((t) => t.user.id === u.id)
      .reduce((s, t) => s + (t.endedAt!.getTime() - t.startedAt.getTime()) / 3_600_000, 0);
    return { technician: `${u.firstName} ${u.lastName}`, jobsAssigned: jobCount, hoursLogged: Math.round(hours * 10) / 10 };
  });

  const materialsUsedMap = new Map<string, { quantity: number; total: number }>();
  for (const m of materials) {
    const key = m.name;
    const existing = materialsUsedMap.get(key) || { quantity: 0, total: 0 };
    existing.quantity += Number(m.quantity);
    existing.total += Number(m.quantity) * Number(m.salePrice);
    materialsUsedMap.set(key, existing);
  }
  const materialsUsed = Array.from(materialsUsedMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  const estimatesApproved = estimatesInRange.filter((e) => e.status === EstimateStatus.APPROVED).length;
  const estimatesDeclined = estimatesInRange.filter((e) => e.status === EstimateStatus.DECLINED).length;

  res.json({
    range: { from, to },
    revenue: Math.round(revenue * 100) / 100,
    invoices: {
      outstandingCount,
      outstandingTotal: Math.round(outstandingTotal * 100) / 100,
      paidCount,
      overdueCount,
      overdueTotal: Math.round(overdueTotal * 100) / 100,
    },
    jobsCreated: jobsInRange.length,
    jobsCompleted,
    byTechnician,
    materialsUsed,
    estimates: {
      approved: estimatesApproved,
      declined: estimatesDeclined,
      winRate: estimatesApproved + estimatesDeclined > 0 ? Math.round((estimatesApproved / (estimatesApproved + estimatesDeclined)) * 100) : null,
    },
  });
});

export default router;
