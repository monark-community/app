-- CreateEnum
CREATE TYPE "DataFormEntryStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED');

-- AlterTable
ALTER TABLE "DataForm" ADD COLUMN     "listEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "listPublicRead" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "listReadFieldKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "DataFormEntry" (
    "id" TEXT NOT NULL,
    "dataFormId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "status" "DataFormEntryStatus" NOT NULL DEFAULT 'PENDING',
    "submitterEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moderatedAt" TIMESTAMP(3),
    "moderatedBy" TEXT,

    CONSTRAINT "DataFormEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataFormEntry_dataFormId_status_idx" ON "DataFormEntry"("dataFormId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DataFormEntry_dataFormId_recordId_key" ON "DataFormEntry"("dataFormId", "recordId");

-- AddForeignKey
ALTER TABLE "DataFormEntry" ADD CONSTRAINT "DataFormEntry_dataFormId_fkey" FOREIGN KEY ("dataFormId") REFERENCES "DataForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataFormEntry" ADD CONSTRAINT "DataFormEntry_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "DataRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
