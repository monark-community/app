/*
  Warnings:

  - The `role` column on the `FeatureFlagOverride` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `role` on the `Invite` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MONARK_ADMIN', 'ADMIN', 'DEVELOPER', 'AMBASSADOR', 'STUDENT');

-- AlterTable
ALTER TABLE "FeatureFlagOverride" DROP COLUMN "role",
ADD COLUMN     "role" "Role";

-- AlterTable
ALTER TABLE "Invite" DROP COLUMN "role",
ADD COLUMN     "role" "Role" NOT NULL;

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "role" "Role" NOT NULL,
    "grantedById" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "reason" TEXT,

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoleAssignment_userId_idx" ON "RoleAssignment"("userId");

-- CreateIndex
CREATE INDEX "RoleAssignment_organizationId_idx" ON "RoleAssignment"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleAssignment_userId_organizationId_role_key" ON "RoleAssignment"("userId", "organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlagOverride_flagKey_organizationId_userId_role_key" ON "FeatureFlagOverride"("flagKey", "organizationId", "userId", "role");

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
