-- AlterTable
ALTER TABLE "Industry" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "TrustedDevice" ALTER COLUMN "expiresAt" SET DEFAULT (now() + INTERVAL '400 days');
