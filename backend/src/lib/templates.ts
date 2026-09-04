import { prisma } from "./prisma";

export const DEFAULT_TEMPLATES = [
  {
    key: "APPOINTMENT_CONFIRMATION",
    name: "Appointment Confirmation",
    subject: "Your appointment is confirmed - {{companyName}}",
    bodyHtml: `<p>Hi {{customerName}},</p><p>Your appointment for <strong>{{jobTitle}}</strong> is scheduled for <strong>{{scheduledDate}}</strong> at {{address}}.</p><p>If you need to reschedule, just reply to this email or give us a call.</p><p>- {{companyName}}</p>`,
    bodyText: "Hi {{customerName}}, your appointment for {{jobTitle}} is scheduled for {{scheduledDate}} at {{address}}. - {{companyName}}",
  },
  {
    key: "APPOINTMENT_REMINDER",
    name: "Appointment Reminder",
    subject: "Reminder: your appointment is coming up - {{companyName}}",
    bodyHtml: `<p>Hi {{customerName}},</p><p>Just a reminder that we have you scheduled for <strong>{{jobTitle}}</strong> on <strong>{{scheduledDate}}</strong> at {{address}}.</p><p>See you then!</p><p>- {{companyName}}</p>`,
    bodyText: "Reminder: {{jobTitle}} is scheduled for {{scheduledDate}} at {{address}}. - {{companyName}}",
  },
  {
    key: "TECHNICIAN_EN_ROUTE",
    name: "Technician En Route",
    subject: "Your technician is on the way - {{companyName}}",
    bodyHtml: `<p>Hi {{customerName}},</p><p>Your technician is on the way to {{address}} for <strong>{{jobTitle}}</strong>.</p><p>- {{companyName}}</p>`,
    bodyText: "Your technician is on the way for {{jobTitle}} at {{address}}. - {{companyName}}",
  },
  {
    key: "JOB_COMPLETION",
    name: "Job Completed",
    subject: "Job complete: {{jobTitle}} - {{companyName}}",
    bodyHtml: `<p>Hi {{customerName}},</p><p>We've completed <strong>{{jobTitle}}</strong> at {{address}}. Thanks for choosing {{companyName}}!</p><p>- {{companyName}}</p>`,
    bodyText: "We've completed {{jobTitle}} at {{address}}. Thanks for choosing {{companyName}}!",
  },
  {
    key: "ESTIMATE_READY",
    name: "Estimate Ready",
    subject: "Your estimate {{estimateNumber}} is ready - {{companyName}}",
    bodyHtml: `<p>Hi {{customerName}},</p><p>Your estimate <strong>{{estimateNumber}}</strong> (total: {{total}}) is ready for review. We'll follow up to go over the details, or feel free to reach out with any questions.</p><p>- {{companyName}}</p>`,
    bodyText: "Your estimate {{estimateNumber}} (total: {{total}}) is ready. - {{companyName}}",
  },
  {
    key: "INVOICE_READY",
    name: "Invoice Ready",
    subject: "Invoice {{invoiceNumber}} from {{companyName}}",
    bodyHtml: `<p>Hi {{customerName}},</p><p>Your invoice <strong>{{invoiceNumber}}</strong> for {{jobTitle}} is ready. Amount due: <strong>{{total}}</strong>{{dueDate}}.</p><p>- {{companyName}}</p>`,
    bodyText: "Invoice {{invoiceNumber}} - amount due {{total}}{{dueDate}}. - {{companyName}}",
  },
  {
    key: "PAYMENT_RECEIPT",
    name: "Payment Receipt",
    subject: "Payment received - {{invoiceNumber}} - {{companyName}}",
    bodyHtml: `<p>Hi {{customerName}},</p><p>We've received your payment of <strong>{{amount}}</strong> for invoice <strong>{{invoiceNumber}}</strong>. Thank you!</p><p>- {{companyName}}</p>`,
    bodyText: "Payment of {{amount}} received for invoice {{invoiceNumber}}. Thank you! - {{companyName}}",
  },
  {
    key: "CUSTOMER_PORTAL_INVITE",
    name: "Customer Portal Invite",
    subject: "You're invited to your {{companyName}} customer portal",
    bodyHtml: `<p>Hi {{customerName}},</p><p>You can now view your appointments, estimates, and invoices online. <a href="{{portalUrl}}">Click here to set up your account</a> (this link expires in 48 hours).</p><p>- {{companyName}}</p>`,
    bodyText: "Set up your customer portal account: {{portalUrl}} (expires in 48 hours). - {{companyName}}",
  },
];

// Upserts default templates by key on every boot. Existing edits (matched
// by key) are left alone - this only fills in templates that don't exist
// yet, so an admin's customizations never get silently overwritten.
export async function ensureDefaultTemplates() {
  for (const t of DEFAULT_TEMPLATES) {
    const existing = await prisma.emailTemplate.findUnique({ where: { key: t.key } });
    if (!existing) {
      await prisma.emailTemplate.create({ data: t });
    }
  }
}

export function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}
