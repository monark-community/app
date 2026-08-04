-- Saved MonarkQL queries per Data Model (personal + shareable).
CREATE TABLE "DataRecordView" (
    "id" TEXT NOT NULL,
    "dataModelId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataRecordView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DataRecordView_dataModelId_idx" ON "DataRecordView"("dataModelId");
CREATE INDEX "DataRecordView_organizationId_idx" ON "DataRecordView"("organizationId");
CREATE INDEX "DataRecordView_createdBy_idx" ON "DataRecordView"("createdBy");

ALTER TABLE "DataRecordView" ADD CONSTRAINT "DataRecordView_dataModelId_fkey"
    FOREIGN KEY ("dataModelId") REFERENCES "DataModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRecordView" ADD CONSTRAINT "DataRecordView_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
