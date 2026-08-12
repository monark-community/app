-- AlterEnum
ALTER TYPE "DataFieldType" ADD VALUE 'DOCUMENT';

-- NOTE: Prisma folds a spurious `DROP INDEX "DataRecord_data_gin"` into every
-- migration because the GIN index is created by raw SQL it can't see in the
-- schema. Stripped here ; dropping it would remove the Data Model JSONB search
-- index. (Same treatment as prior migrations.)

-- AlterTable
-- Idempotent `dbgenerated` default Prisma re-emits because it can't read the
-- INTERVAL expression ; harmless, kept (appears in many prior migrations).
ALTER TABLE "TrustedDevice" ALTER COLUMN "expiresAt" SET DEFAULT (now() + INTERVAL '400 days');
