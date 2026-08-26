-- Phase 5: customer portal. Adds portal login fields directly to customers
-- (separate password hash from staff `users` — customers are never staff
-- accounts and must never be able to authenticate against staff routes),
-- plus a lightweight message thread and customer-uploaded documents.

ALTER TABLE "customers" ADD COLUMN "portalEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "customers" ADD COLUMN "portalPasswordHash" TEXT;
ALTER TABLE "customers" ADD COLUMN "portalInviteToken" TEXT;
ALTER TABLE "customers" ADD COLUMN "portalInviteExpires" TIMESTAMP(3);
CREATE UNIQUE INDEX "customers_portalInviteToken_key" ON "customers"("portalInviteToken");

CREATE TABLE "customer_messages" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "jobId" TEXT,
    "fromCustomer" BOOLEAN NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    CONSTRAINT "customer_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "customer_messages_customerId_idx" ON "customer_messages"("customerId");
ALTER TABLE "customer_messages" ADD CONSTRAINT "customer_messages_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "customer_documents" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "jobId" TEXT,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "customer_documents_customerId_idx" ON "customer_documents"("customerId");
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
