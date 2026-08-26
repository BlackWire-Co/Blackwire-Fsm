-- Allow multiple estimates/invoices per job, and multiple invoices per
-- estimate, so office staff can correct or add to billing after the fact
-- instead of being locked into a single estimate/invoice per job.

DROP INDEX "estimates_jobId_key";
CREATE INDEX "estimates_jobId_idx" ON "estimates"("jobId");

DROP INDEX "invoices_jobId_key";
CREATE INDEX "invoices_jobId_idx" ON "invoices"("jobId");

DROP INDEX "invoices_estimateId_key";
CREATE INDEX "invoices_estimateId_idx" ON "invoices"("estimateId");

-- Price book: reusable catalog of materials/services admin and office can
-- add to jobs, estimates, and invoices instead of retyping pricing each time.

CREATE TABLE "price_book_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "description" TEXT,
    "cost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "salePrice" DECIMAL(10,2) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "price_book_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "price_book_items_active_idx" ON "price_book_items"("active");
