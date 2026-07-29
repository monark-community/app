-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "scheduleNextRunAt" TIMESTAMP(3);

-- AlterTable
-- (Redundant no-op re-set of the TrustedDevice default Prisma's diff surfaces
-- for the `dbgenerated` default. The pre-existing hand-written
-- `DataRecord_data_gin` GIN index isn't modeled in the schema, so migrate
-- proposes dropping it every time ; that drop is stripped here.)
ALTER TABLE "TrustedDevice" ALTER COLUMN "expiresAt" SET DEFAULT (now() + INTERVAL '400 days');

-- CreateIndex
CREATE INDEX "Automation_scheduleNextRunAt_idx" ON "Automation"("scheduleNextRunAt");
