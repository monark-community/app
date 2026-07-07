-- Drop the legacy Projects + Industries module (superseded by the polymorphic
-- Data Models engine). Tables + their data are removed intentionally.
-- Note: the hand-written `DataRecord_data_gin` index and the `TrustedDevice`
-- default that `prisma migrate diff` also surfaces are deliberately NOT touched
-- here — they're pre-existing, unrelated to this removal.

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectContributor" DROP CONSTRAINT "ProjectContributor_membershipId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectContributor" DROP CONSTRAINT "ProjectContributor_projectId_fkey";

-- DropForeignKey
ALTER TABLE "_ProjectIndustries" DROP CONSTRAINT "_ProjectIndustries_A_fkey";

-- DropForeignKey
ALTER TABLE "_ProjectIndustries" DROP CONSTRAINT "_ProjectIndustries_B_fkey";

-- DropTable
DROP TABLE "ProjectContributor";

-- DropTable
DROP TABLE "_ProjectIndustries";

-- DropTable
DROP TABLE "Project";

-- DropTable
DROP TABLE "Industry";

-- DropEnum
DROP TYPE "ProjectPublicStatus";
