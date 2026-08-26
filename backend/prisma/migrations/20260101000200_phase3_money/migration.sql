-- Phase 3: estimates, invoices, and payments.

CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'APPROVED', 'DECLINED', 'EXPIRED');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CHECK', 'CARD', 'ACH', 'OTHER');

CREATE TABLE "estimates" (
    "id" TEXT NOT NULL,
    "estimateNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "jobId" TEXT,
    "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expirationDate" TIMESTAMP(3),
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "terms" TEXT,
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedByName" TEXT,
    "approvalIp" TEXT,
    "declinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "estimates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "estimates_estimateNumber_key" ON "estimates"("estimateNumber");
CREATE UNIQUE INDEX "estimates_jobId_key" ON "estimates"("jobId");
CREATE INDEX "estimates_customerId_idx" ON "estimates"("customerId");
CREATE INDEX "estimates_status_idx" ON "estimates"("status");
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "estimate_items" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "estimate_items_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "estimate_items" ADD CONSTRAINT "estimate_items_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "jobId" TEXT,
    "estimateId" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "terms" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");
CREATE UNIQUE INDEX "invoices_jobId_key" ON "invoices"("jobId");
CREATE UNIQUE INDEX "invoices_estimateId_key" ON "invoices"("estimateId");
CREATE INDEX "invoices_customerId_idx" ON "invoices"("customerId");
CREATE INDEX "invoices_status_idx" ON "invoices"("status");
CREATE INDEX "invoices_dueDate_idx" ON "invoices"("dueDate");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "recordedById" TEXT,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
