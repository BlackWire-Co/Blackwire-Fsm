import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null | undefined;

// Lazily built so a missing/blank SMTP config doesn't crash the app at
// boot - the whole point of self-hosted field service software is that it
// has to keep working with zero external integrations configured.
function getTransporter() {
  if (transporter !== undefined) return transporter;

  if (!process.env.SMTP_HOST) {
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });
  return transporter;
}

export async function sendMail(params: { to: string; subject: string; html: string }): Promise<{ ok: boolean; error?: string }> {
  const t = getTransporter();
  if (!t) return { ok: false, error: "SMTP not configured (SMTP_HOST is unset)" };

  // Built as an address object rather than a hand-formatted "Name <email>"
  // string - string parsing is where a stray/missing quote from an .env
  // value turns into an empty envelope sender, which mail servers reject
  // outright ("Sender address rejected: No empty senders allowed").
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
  if (!fromEmail) {
    return { ok: false, error: "SMTP_FROM_EMAIL (or SMTP_USER) must be set to a real email address" };
  }
  const fromName = process.env.SMTP_FROM_NAME || process.env.COMPANY_NAME || "Field Service";

  try {
    await t.sendMail({
      from: { name: fromName, address: fromEmail },
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Unknown SMTP error" };
  }
}
