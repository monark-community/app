-- Brand surface tint on the organization row, next to primaryColor.
-- Nullable: null means "use the deployment's BRANDING_SURFACE_TINT".
ALTER TABLE "Organization" ADD COLUMN "surfaceTint" DOUBLE PRECISION;

-- Carry over tints saved while the value lived in the metadata sidecar
-- (module "organizations", key "brand.surface-tint"), then drop those rows.
UPDATE "Organization" AS o
SET "surfaceTint" = (m."value" #>> '{}')::double precision
FROM "OrganizationMetadata" AS m
WHERE m."organizationId" = o."id"
  AND m."module" = 'organizations'
  AND m."key" = 'brand.surface-tint'
  AND jsonb_typeof(m."value") = 'number';

DELETE FROM "OrganizationMetadata"
WHERE "module" = 'organizations'
  AND "key" = 'brand.surface-tint';
