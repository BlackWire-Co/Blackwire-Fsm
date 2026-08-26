import { prisma } from "./prisma";
import { getSettings } from "./settings";

/**
 * Generates a sequential, human-friendly document number like JOB-000123,
 * using the prefix configured on the Settings page (falls back to sensible
 * defaults if settings haven't been touched yet).
 */
export async function nextJobNumber(): Promise<string> {
  const [count, settings] = await Promise.all([prisma.job.count(), getSettings()]);
  return `${settings.jobNumberPrefix}-${String(count + 1).padStart(6, "0")}`;
}

export async function nextEstimateNumber(): Promise<string> {
  const [count, settings] = await Promise.all([prisma.estimate.count(), getSettings()]);
  return `${settings.estimateNumberPrefix}-${String(count + 1).padStart(6, "0")}`;
}

export async function nextInvoiceNumber(): Promise<string> {
  const [count, settings] = await Promise.all([prisma.invoice.count(), getSettings()]);
  return `${settings.invoiceNumberPrefix}-${String(count + 1).padStart(6, "0")}`;
}
