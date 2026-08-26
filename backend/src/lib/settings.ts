import { prisma } from "./prisma";

// Seeds the settings row once from whatever was in .env, so upgrading from
// the old env-var-only config doesn't reset anyone's company info. After
// this first boot, the Settings page in the app is the source of truth —
// editing .env no longer does anything for these values.
export async function ensureSettings() {
  const existing = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  if (existing) return existing;

  return prisma.appSettings.create({
    data: {
      id: "singleton",
      companyName: process.env.COMPANY_NAME || "Your Company Name",
      companyAddress: process.env.COMPANY_ADDRESS || null,
      companyPhone: process.env.COMPANY_PHONE || null,
      companyEmail: process.env.COMPANY_EMAIL || null,
      defaultLaborRate: Number(process.env.DEFAULT_LABOR_RATE || 85),
    },
  });
}

export async function getSettings() {
  const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  if (settings) return settings;
  return ensureSettings();
}
