-- Phase 6: settings singleton (moves company info/labor rate/numbering out
-- of .env into an editable admin UI), recurring jobs, and reminder tracking.

CREATE TYPE "RecurrenceInterval" AS ENUM ('NONE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY');

ALTER TABLE "jobs" ADD COLUMN "recurrenceInterval" "RecurrenceInterval" NOT NULL DEFAULT 'NONE';
ALTER TABLE "jobs" ADD COLUMN "nextRecurrenceDate" TIMESTAMP(3);
ALTER TABLE "jobs" ADD COLUMN "reminderSentAt" TIMESTAMP(3);

CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "companyName" TEXT NOT NULL DEFAULT 'Your Company Name',
    "companyAddress" TEXT,
    "companyPhone" TEXT,
    "companyEmail" TEXT,
    "defaultLaborRate" DECIMAL(10,2) NOT NULL DEFAULT 85,
    "defaultTaxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "jobNumberPrefix" TEXT NOT NULL DEFAULT 'JOB',
    "estimateNumberPrefix" TEXT NOT NULL DEFAULT 'EST',
    "invoiceNumberPrefix" TEXT NOT NULL DEFAULT 'INV',
    "autoSendReminders" BOOLEAN NOT NULL DEFAULT false,
    "reminderHoursBefore" INTEGER NOT NULL DEFAULT 24,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);
