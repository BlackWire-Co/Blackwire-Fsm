-- Adds labeled, multi-value phone numbers and emails per customer (e.g.
-- Mobile / Home / Work, or a billing email separate from the main one).
-- The existing customers.phone / customers.mobilePhone / customers.email
-- columns are kept and are now a mirror of the row marked isPrimary (or,
-- for mobilePhone, the row labeled "Mobile") in the new tables below, so
-- notify.ts / CSV export / search that read those columns directly keep
-- working unchanged. All edits going forward happen through the new
-- customer_phones / customer_emails tables via the API.

CREATE TABLE "customer_phones" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Mobile',
    "number" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_phones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_phones_customerId_idx" ON "customer_phones"("customerId");

ALTER TABLE "customer_phones" ADD CONSTRAINT "customer_phones_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "customer_emails" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Primary',
    "address" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_emails_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_emails_customerId_idx" ON "customer_emails"("customerId");

ALTER TABLE "customer_emails" ADD CONSTRAINT "customer_emails_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: turn every existing customer's phone / mobilePhone / email
-- columns into rows here so nobody's existing contact info disappears.
-- IDs are built with md5() instead of gen_random_uuid() so this doesn't
-- depend on the pgcrypto extension being enabled; the "id" column is plain
-- TEXT (Prisma generates real UUIDs client-side, not via a DB default), so
-- any unique string works.

INSERT INTO "customer_phones" ("id", "customerId", "label", "number", "isPrimary")
SELECT md5(random()::text || clock_timestamp()::text || "id"), "id", 'Phone', "phone", true
FROM "customers"
WHERE "phone" IS NOT NULL AND "phone" != '';

INSERT INTO "customer_phones" ("id", "customerId", "label", "number", "isPrimary")
SELECT md5(random()::text || clock_timestamp()::text || "id"), "id", 'Mobile', "mobilePhone", false
FROM "customers"
WHERE "mobilePhone" IS NOT NULL AND "mobilePhone" != '';

INSERT INTO "customer_emails" ("id", "customerId", "label", "address", "isPrimary")
SELECT md5(random()::text || clock_timestamp()::text || "id"), "id", 'Primary', "email", true
FROM "customers"
WHERE "email" IS NOT NULL AND "email" != '';
