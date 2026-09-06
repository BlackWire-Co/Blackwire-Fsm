-- Public online booking: a customer-facing scheduling page layered on top
-- of the existing Job model. Adds a singleton settings row, a service
-- catalog, per-user "provider" flags with their own weekly availability /
-- breaks / one-off blocks, and a few tracking columns on jobs so a booking
-- remembers what was actually picked and quoted at the time.

-- Jobs created through the public page are otherwise ordinary Job rows
-- (auto-confirmed straight onto the schedule) - these three columns just
-- keep a record of where the job came from and what was promised.
ALTER TABLE "jobs" ADD COLUMN "source" TEXT;
ALTER TABLE "jobs" ADD COLUMN "bookedServiceId" TEXT;
ALTER TABLE "jobs" ADD COLUMN "bookedPrice" DECIMAL(10,2);

CREATE TABLE "booking_settings" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "arrivalWindowMin" INTEGER NOT NULL DEFAULT 60,
    "bufferMin" INTEGER NOT NULL DEFAULT 30,
    "minNoticeHours" INTEGER NOT NULL DEFAULT 24,
    "maxAdvanceDays" INTEGER NOT NULL DEFAULT 60,
    "slotIntervalMin" INTEGER NOT NULL DEFAULT 30,
    "requireAddress" BOOLEAN NOT NULL DEFAULT true,
    "requirePhone" BOOLEAN NOT NULL DEFAULT true,
    "requireEmail" BOOLEAN NOT NULL DEFAULT false,
    "requireNotes" BOOLEAN NOT NULL DEFAULT false,
    "confirmationNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "booking_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_services" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMin" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "booking_services_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_services_active_idx" ON "booking_services"("active");

CREATE TABLE "booking_providers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_providers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_providers_userId_key" ON "booking_providers"("userId");

ALTER TABLE "booking_providers" ADD CONSTRAINT "booking_providers_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "booking_availability" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    CONSTRAINT "booking_availability_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_availability_providerId_idx" ON "booking_availability"("providerId");

ALTER TABLE "booking_availability" ADD CONSTRAINT "booking_availability_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "booking_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "booking_breaks" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "label" TEXT,
    CONSTRAINT "booking_breaks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_breaks_providerId_idx" ON "booking_breaks"("providerId");

ALTER TABLE "booking_breaks" ADD CONSTRAINT "booking_breaks_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "booking_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "booking_blocks" (
    "id" TEXT NOT NULL,
    "providerId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_blocks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_blocks_providerId_idx" ON "booking_blocks"("providerId");
CREATE INDEX "booking_blocks_startAt_endAt_idx" ON "booking_blocks"("startAt", "endAt");

ALTER TABLE "booking_blocks" ADD CONSTRAINT "booking_blocks_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "booking_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "jobs_bookedServiceId_idx" ON "jobs"("bookedServiceId");

ALTER TABLE "jobs" ADD CONSTRAINT "jobs_bookedServiceId_fkey"
    FOREIGN KEY ("bookedServiceId") REFERENCES "booking_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the singleton settings row (booking stays OFF until an admin turns
-- it on from the new settings page and adds at least one service/provider).
INSERT INTO "booking_settings" ("id", "updatedAt")
VALUES ('singleton', CURRENT_TIMESTAMP);
