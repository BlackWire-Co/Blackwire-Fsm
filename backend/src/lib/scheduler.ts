import { prisma } from "./prisma";
import { JobStatus, RecurrenceInterval } from "@prisma/client";
import { nextJobNumber } from "./numbering";
import { getSettings } from "./settings";
import { notifyCustomer } from "./notify";
import { logAudit } from "./audit";

// A simple setInterval-based scheduler running inside the single backend
// process. This is intentionally NOT a distributed job queue (no BullMQ/
// Redis-backed workers) — for a self-hosted single-container deployment,
// an in-process timer is simpler to operate and sufficient. If this app is
// ever run as multiple backend replicas, this would need to move to a
// proper distributed queue to avoid duplicate runs.

export function addInterval(date: Date, interval: RecurrenceInterval): Date {
  const d = new Date(date);
  switch (interval) {
    case "WEEKLY": d.setDate(d.getDate() + 7); break;
    case "BIWEEKLY": d.setDate(d.getDate() + 14); break;
    case "MONTHLY": d.setMonth(d.getMonth() + 1); break;
    case "QUARTERLY": d.setMonth(d.getMonth() + 3); break;
    case "SEMI_ANNUALLY": d.setMonth(d.getMonth() + 6); break;
    case "ANNUALLY": d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}

async function generateRecurringJobs() {
  const due = await prisma.job.findMany({
    where: { recurrenceInterval: { not: RecurrenceInterval.NONE }, nextRecurrenceDate: { lte: new Date() } },
    include: { technicians: true },
  });

  for (const job of due) {
    try {
      const jobNumber = await nextJobNumber();
      const newScheduledDate = job.nextRecurrenceDate!;

      await prisma.job.create({
        data: {
          jobNumber,
          customerId: job.customerId,
          propertyId: job.propertyId,
          title: job.title,
          description: job.description,
          priority: job.priority,
          status: JobStatus.SCHEDULED,
          scheduledDate: newScheduledDate,
          estimatedDurationMin: job.estimatedDurationMin,
          technicians: job.technicians.length ? { create: job.technicians.map((t) => ({ userId: t.userId })) } : undefined,
          statusHistory: { create: { status: JobStatus.SCHEDULED, note: `Auto-generated from recurring job ${job.jobNumber}` } },
        },
      });

      await prisma.job.update({
        where: { id: job.id },
        data: { nextRecurrenceDate: addInterval(newScheduledDate, job.recurrenceInterval) },
      });

      await logAudit({ action: "job.recurrence_generated", entityType: "job", entityId: job.id, metadata: { jobNumber } });
    } catch (err: any) {
      console.error(`Failed to generate recurring job from ${job.jobNumber}:`, err.message);
    }
  }
}

async function sendDueReminders() {
  const settings = await getSettings();
  if (!settings.autoSendReminders) return;

  const windowStart = new Date(Date.now() + (settings.reminderHoursBefore - 1) * 60 * 60 * 1000);
  const windowEnd = new Date(Date.now() + (settings.reminderHoursBefore + 1) * 60 * 60 * 1000);

  const jobs = await prisma.job.findMany({
    where: {
      scheduledDate: { gte: windowStart, lte: windowEnd },
      reminderSentAt: null,
      status: { notIn: [JobStatus.CANCELLED, JobStatus.COMPLETED, JobStatus.PAID] },
    },
    include: {
      customer: { select: { firstName: true, lastName: true, email: true, phone: true, mobilePhone: true, preferredContactMethod: true } },
      property: true,
    },
  });

  for (const job of jobs) {
    try {
      await notifyCustomer({
        templateKey: "APPOINTMENT_REMINDER",
        customer: job.customer,
        variables: {
          jobTitle: job.title,
          scheduledDate: job.scheduledDate!.toLocaleString(),
          address: `${job.property.addressLine1}, ${job.property.city}, ${job.property.state}`,
        },
        relatedType: "job",
        relatedId: job.id,
      });
      await prisma.job.update({ where: { id: job.id }, data: { reminderSentAt: new Date() } });
    } catch (err: any) {
      console.error(`Failed to send reminder for job ${job.jobNumber}:`, err.message);
    }
  }
}

let started = false;

export function startScheduler() {
  if (started) return; // guard against double-start from hot reload in dev
  started = true;

  const RUN_EVERY_MS = 30 * 60 * 1000; // 30 minutes — coarse but adequate for daily-scale scheduling
  const tick = async () => {
    await generateRecurringJobs().catch((err) => console.error("generateRecurringJobs failed:", err.message));
    await sendDueReminders().catch((err) => console.error("sendDueReminders failed:", err.message));
  };

  tick(); // run once shortly after boot rather than waiting a full interval
  setInterval(tick, RUN_EVERY_MS);
}
