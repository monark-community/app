-- CreateEnum
CREATE TYPE "DataFormMode" AS ENUM ('ANONYMOUS', 'EMAIL');

-- CreateTable
CREATE TABLE "DataForm" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataModelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "mode" "DataFormMode" NOT NULL DEFAULT 'ANONYMOUS',
    "fieldKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "closesAt" TIMESTAMP(3),
    "intro" TEXT,
    "successMessage" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DataForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataFormInvite" (
    "id" TEXT NOT NULL,
    "dataFormId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "recordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataFormInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DataForm_token_key" ON "DataForm"("token");

-- CreateIndex
CREATE INDEX "DataForm_organizationId_idx" ON "DataForm"("organizationId");

-- CreateIndex
CREATE INDEX "DataForm_dataModelId_idx" ON "DataForm"("dataModelId");

-- CreateIndex
CREATE UNIQUE INDEX "DataFormInvite_tokenHash_key" ON "DataFormInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "DataFormInvite_dataFormId_idx" ON "DataFormInvite"("dataFormId");

-- CreateIndex
CREATE UNIQUE INDEX "DataFormInvite_dataFormId_email_key" ON "DataFormInvite"("dataFormId", "email");

-- AddForeignKey
ALTER TABLE "DataForm" ADD CONSTRAINT "DataForm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataForm" ADD CONSTRAINT "DataForm_dataModelId_fkey" FOREIGN KEY ("dataModelId") REFERENCES "DataModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataFormInvite" ADD CONSTRAINT "DataFormInvite_dataFormId_fkey" FOREIGN KEY ("dataFormId") REFERENCES "DataForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
