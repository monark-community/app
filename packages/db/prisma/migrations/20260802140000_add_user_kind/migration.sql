-- CreateEnum
CREATE TYPE "UserKind" AS ENUM ('HUMAN', 'SERVICE');

-- AlterTable : all existing rows default to HUMAN ; SERVICE users are minted
-- explicitly by the service-account admin surface.
ALTER TABLE "User" ADD COLUMN "kind" "UserKind" NOT NULL DEFAULT 'HUMAN';
ALTER TABLE "User" ADD COLUMN "createdBy" TEXT;
