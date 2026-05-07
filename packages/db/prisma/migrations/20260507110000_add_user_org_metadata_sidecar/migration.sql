-- Generic metadata sidecar for User + Organization. Extended modules
-- attach their own per-user / per-org data here without modifying the
-- core schema. Identity is (parent_id, module, key) ; the value is
-- unstructured JSON. Reads + writes are gated by per-module
-- permissions registered through @monark/rbac (`users.write-metadata-
-- for-module-<x>` and the orgs equivalent), so a misbehaving extended
-- module can't reach a different module's slice.
--
-- The sidecar is the cheap path. When an extended module needs
-- indexed columns or strong typing at the DB layer, we move it to
-- per-module schema fragments in a follow-up phase.

CREATE TABLE "UserMetadata" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "module"    TEXT NOT NULL,
    "key"       TEXT NOT NULL,
    "value"     JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMetadata_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserMetadata_userId_module_key_key"
    ON "UserMetadata"("userId", "module", "key");
CREATE INDEX "UserMetadata_module_idx" ON "UserMetadata"("module");
CREATE INDEX "UserMetadata_userId_module_idx"
    ON "UserMetadata"("userId", "module");

ALTER TABLE "UserMetadata" ADD CONSTRAINT "UserMetadata_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrganizationMetadata" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "module"         TEXT NOT NULL,
    "key"            TEXT NOT NULL,
    "value"          JSONB NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMetadata_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationMetadata_organizationId_module_key_key"
    ON "OrganizationMetadata"("organizationId", "module", "key");
CREATE INDEX "OrganizationMetadata_module_idx"
    ON "OrganizationMetadata"("module");
CREATE INDEX "OrganizationMetadata_organizationId_module_idx"
    ON "OrganizationMetadata"("organizationId", "module");

ALTER TABLE "OrganizationMetadata" ADD CONSTRAINT
    "OrganizationMetadata_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
