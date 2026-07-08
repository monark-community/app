-- Per-record role access (row-level authorization), mirroring CalendarRoleAccess.
-- A DataRecord with no rows here is visible to everyone who can access its Data
-- Model ; with rows, only those roles (plus data admins, who bypass in code).
CREATE TABLE "DataRecordRoleAccess" (
    "dataRecordId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    CONSTRAINT "DataRecordRoleAccess_pkey" PRIMARY KEY ("dataRecordId", "roleId")
);

CREATE INDEX "DataRecordRoleAccess_roleId_idx" ON "DataRecordRoleAccess" ("roleId");

ALTER TABLE "DataRecordRoleAccess"
  ADD CONSTRAINT "DataRecordRoleAccess_dataRecordId_fkey"
  FOREIGN KEY ("dataRecordId") REFERENCES "DataRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DataRecordRoleAccess"
  ADD CONSTRAINT "DataRecordRoleAccess_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
