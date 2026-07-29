-- CreateTable
CREATE TABLE "Secret" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueCipher" BYTEA NOT NULL,
    "valueIv" BYTEA NOT NULL,
    "valueTag" BYTEA NOT NULL,
    "description" TEXT,
    "createdBy" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Secret_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Secret_organizationId_idx" ON "Secret"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Secret_organizationId_key_key" ON "Secret"("organizationId", "key");

-- AddForeignKey
ALTER TABLE "Secret" ADD CONSTRAINT "Secret_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
