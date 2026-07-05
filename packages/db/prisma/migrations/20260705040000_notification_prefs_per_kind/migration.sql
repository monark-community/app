-- Per-event notification preferences : the preference key moves from
-- (userId, category, channel) to (userId, kind, channel), so a user can
-- silence one specific event without muting its whole category. Existing
-- per-category rows are dropped (an approved reset) — users revert to the
-- registry defaults and re-tune per event.

-- Reset existing rows so the NOT NULL `kind` column can be added.
DELETE FROM "NotificationPreference";

-- DropIndex
DROP INDEX "NotificationPreference_userId_category_channel_key";

-- AlterTable
ALTER TABLE "NotificationPreference" DROP COLUMN "category",
ADD COLUMN     "kind" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_kind_channel_key" ON "NotificationPreference"("userId", "kind", "channel");
