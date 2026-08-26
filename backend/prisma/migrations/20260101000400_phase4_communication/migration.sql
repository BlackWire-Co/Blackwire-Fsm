-- Phase 4: communication. Editable email templates and a log of every
-- notification attempt (sent/failed/skipped), so email/SMS gaps are visible
-- instead of silently disappearing.

CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS');
CREATE TYPE "NotificationStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "email_templates_key_key" ON "email_templates"("key");

CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "templateKey" TEXT,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "error" TEXT,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notification_logs_relatedType_relatedId_idx" ON "notification_logs"("relatedType", "relatedId");
CREATE INDEX "notification_logs_createdAt_idx" ON "notification_logs"("createdAt");
