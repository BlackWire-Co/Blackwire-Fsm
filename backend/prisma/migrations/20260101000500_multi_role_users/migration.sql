-- Allow a user to hold multiple roles (e.g. a solo operator who is both
-- Admin and Technician) instead of being locked into exactly one.

ALTER TABLE "users" ADD COLUMN "roles" "UserRole"[] NOT NULL DEFAULT ARRAY[]::"UserRole"[];

-- Migrate every existing user's single role into the new array column
-- before dropping the old one, so no one loses access on upgrade.
UPDATE "users" SET "roles" = ARRAY["role"];

ALTER TABLE "users" DROP COLUMN "role";
