-- Baseline schema: users, customers, properties, jobs, and related tables.

CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OFFICE', 'TECHNICIAN');
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "PreferredContactMethod" AS ENUM ('PHONE', 'EMAIL', 'TEXT');
CREATE TYPE "JobStatus" AS ENUM ('NEW', 'NEEDS_SCHEDULING', 'SCHEDULED', 'EN_ROUTE', 'ON_SITE', 'IN_PROGRESS', 'AWAITING_PARTS', 'COMPLETED', 'CANCELLED', 'INVOICED', 'PAID');
CREATE TYPE "JobPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "companyName" TEXT,
    "phone" TEXT,
    "mobilePhone" TEXT,
    "email" TEXT,
    "preferredContactMethod" "PreferredContactMethod" NOT NULL DEFAULT 'PHONE',
    "notes" TEXT,
    "billingAddressLine1" TEXT,
    "billingAddressLine2" TEXT,
    "billingCity" TEXT,
    "billingState" TEXT,
    "billingZip" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "customers_lastName_firstName_idx" ON "customers"("lastName", "firstName");

CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "unit" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "notes" TEXT,
    "accessInstructions" TEXT,
    "gateCode" TEXT,
    "hasPets" BOOLEAN NOT NULL DEFAULT false,
    "petNotes" TEXT,
    "entryInstructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "properties_customerId_idx" ON "properties"("customerId");
ALTER TABLE "properties" ADD CONSTRAINT "properties_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "jobNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "problemRequest" TEXT,
    "priority" "JobPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "JobStatus" NOT NULL DEFAULT 'NEW',
    "scheduledDate" TIMESTAMP(3),
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "estimatedDurationMin" INTEGER,
    "internalNotes" TEXT,
    "customerVisibleNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "jobs_jobNumber_key" ON "jobs"("jobNumber");
CREATE INDEX "jobs_customerId_idx" ON "jobs"("customerId");
CREATE INDEX "jobs_propertyId_idx" ON "jobs"("propertyId");
CREATE INDEX "jobs_status_idx" ON "jobs"("status");
CREATE INDEX "jobs_scheduledDate_idx" ON "jobs"("scheduledDate");
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "job_technicians" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_technicians_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "job_technicians_jobId_userId_key" ON "job_technicians"("jobId", "userId");
ALTER TABLE "job_technicians" ADD CONSTRAINT "job_technicians_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_technicians" ADD CONSTRAINT "job_technicians_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "job_status_history" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL,
    "changedBy" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "job_status_history_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "job_photos" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_photos_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "job_materials" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "description" TEXT,
    "cost" DECIMAL(10,2) NOT NULL,
    "salePrice" DECIMAL(10,2) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    CONSTRAINT "job_materials_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "job_materials" ADD CONSTRAINT "job_materials_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "notes" TEXT,
    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
