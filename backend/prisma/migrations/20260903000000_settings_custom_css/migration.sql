-- Lets an admin paste custom CSS in Settings to tweak the staff app's look
-- (hover states, spacing, colors) without a code change. Nullable/empty
-- means "no override" - the app ships its default styles unchanged.

ALTER TABLE "app_settings" ADD COLUMN "customCss" TEXT;
