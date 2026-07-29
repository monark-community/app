-- AlterTable
ALTER TABLE "AutomationRunStep" ADD COLUMN     "activeHandles" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
-- (Redundant no-op re-set of the TrustedDevice default Prisma's diff surfaces
-- for the `dbgenerated` default. The pre-existing hand-written
-- `DataRecord_data_gin` GIN index isn't modeled in schema.prisma, so migrate
-- proposes dropping it every time ; that drop is stripped here.)
ALTER TABLE "TrustedDevice" ALTER COLUMN "expiresAt" SET DEFAULT (now() + INTERVAL '400 days');
