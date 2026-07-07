-- AlterTable
-- Additive, core-owned columns supporting @monark/data-models' Calendar
-- integration : when a Data Record has an enabled "calendar" integration
-- mapping, a subscriber upserts a real CalendarEvent keyed on this pair,
-- so Calendar's own read paths (day view, reminders) never need to know
-- about Data Records at all. Both null for an ordinary, hand-created event.
ALTER TABLE "CalendarEvent" ADD COLUMN     "sourceModule" TEXT,
ADD COLUMN     "sourceRecordId" TEXT;

-- CreateIndex
-- Postgres treats NULL as distinct in a UNIQUE constraint, so ordinary
-- events (both columns null) are never constrained by this index ; only
-- materialized events (both columns set) are kept one-per-source-record.
CREATE UNIQUE INDEX "CalendarEvent_sourceModule_sourceRecordId_key" ON "CalendarEvent"("sourceModule", "sourceRecordId");
