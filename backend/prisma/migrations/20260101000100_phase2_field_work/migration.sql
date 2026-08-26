-- Phase 2: electronic signature capture (job completion, authorization, etc.)

CREATE TYPE "SignatureType" AS ENUM ('ESTIMATE_APPROVAL', 'WORK_COMPLETION', 'CUSTOMER_AUTHORIZATION', 'INVOICE_ACKNOWLEDGEMENT');

CREATE TABLE "signatures" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" "SignatureType" NOT NULL,
    "signerName" TEXT NOT NULL,
    "imageData" TEXT NOT NULL,
    "ipAddress" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "signatures_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
