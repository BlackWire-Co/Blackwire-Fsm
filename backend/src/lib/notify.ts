import { prisma } from "./prisma";
import { sendMail } from "./mailer";
import { getSmsProvider } from "./sms";
import { renderTemplate } from "./templates";

interface NotifyCustomer {
  email?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  preferredContactMethod?: string;
  firstName: string;
  lastName: string;
}

/**
 * Sends a templated notification to a customer over email (if they have an
 * address) and/or SMS (only when they've asked to be reached by text and
 * have a phone number on file - we don't double-send by default). Every
 * attempt - sent, failed, or skipped because nothing's configured - gets
 * logged so gaps are visible instead of silently vanishing.
 *
 * Never throws: a notification failure should never block the job/estimate/
 * invoice action that triggered it.
 */
export async function notifyCustomer(params: {
  templateKey: string;
  customer: NotifyCustomer;
  variables: Record<string, string>;
  relatedType?: string;
  relatedId?: string;
}) {
  try {
    const template = await prisma.emailTemplate.findUnique({ where: { key: params.templateKey } });
    if (!template) return;

    const vars = {
      customerName: `${params.customer.firstName} ${params.customer.lastName}`,
      companyName: process.env.COMPANY_NAME || "Your Company",
      ...params.variables,
    };
    const subject = renderTemplate(template.subject, vars);
    const html = renderTemplate(template.bodyHtml, vars);

    if (params.customer.email) {
      const result = await sendMail({ to: params.customer.email, subject, html });
      await prisma.notificationLog.create({
        data: {
          channel: "EMAIL",
          templateKey: params.templateKey,
          recipient: params.customer.email,
          subject,
          body: html,
          status: result.ok ? "SENT" : "SKIPPED",
          error: result.error,
          relatedType: params.relatedType,
          relatedId: params.relatedId,
        },
      });
    }

    const phone = params.customer.mobilePhone || params.customer.phone;
    if (phone && params.customer.preferredContactMethod === "TEXT") {
      const plain = renderTemplate(template.bodyText || template.subject, vars);
      const result = await getSmsProvider().send(phone, plain);
      await prisma.notificationLog.create({
        data: {
          channel: "SMS",
          templateKey: params.templateKey,
          recipient: phone,
          body: plain,
          status: result.ok ? "SENT" : "SKIPPED",
          error: result.error,
          relatedType: params.relatedType,
          relatedId: params.relatedId,
        },
      });
    }
  } catch (err: any) {
    console.error(`notifyCustomer(${params.templateKey}) failed:`, err.message);
  }
}
