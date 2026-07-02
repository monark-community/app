-- Adds the @monark/projects module's tables. Three models + one
-- enum, plus a seed of the canonical 22-industry taxonomy at the
-- bottom (idempotent via `ON CONFLICT DO NOTHING` so a re-run after a
-- manual industry edit doesn't clobber the operator's changes).

CREATE TYPE "ProjectPublicStatus" AS ENUM (
  'IDEA',
  'PROTOTYPE_AVAILABLE',
  'IN_PROGRESS',
  'QA',
  'COMPLETED'
);

CREATE TABLE "Project" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "url" TEXT,
  "description" TEXT,
  "publicStatus" "ProjectPublicStatus" NOT NULL DEFAULT 'IDEA',
  "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3)
);

CREATE UNIQUE INDEX "Project_organizationId_slug_key"
  ON "Project"("organizationId", "slug");
CREATE INDEX "Project_organizationId_publicStatus_idx"
  ON "Project"("organizationId", "publicStatus");
CREATE INDEX "Project_organizationId_deletedAt_idx"
  ON "Project"("organizationId", "deletedAt");

CREATE TABLE "Industry" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "displayName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3)
);

CREATE INDEX "Industry_deletedAt_idx" ON "Industry"("deletedAt");

-- Implicit M2M join table that Prisma generates from
-- `Project.industries Industry[] @relation("ProjectIndustries")`.
-- Naming follows Prisma's convention (`_ProjectIndustries`) so the
-- generated client recognises it.
CREATE TABLE "_ProjectIndustries" (
  "A" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "B" TEXT NOT NULL REFERENCES "Industry"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "_ProjectIndustries_AB_unique"
  ON "_ProjectIndustries"("A", "B");
CREATE INDEX "_ProjectIndustries_B_index"
  ON "_ProjectIndustries"("B");

CREATE TABLE "ProjectContributor" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "membershipId" TEXT NOT NULL REFERENCES "OrganizationMembership"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ProjectContributor_projectId_membershipId_key"
  ON "ProjectContributor"("projectId", "membershipId");
CREATE INDEX "ProjectContributor_membershipId_idx"
  ON "ProjectContributor"("membershipId");

-- ──────────────────────────────────────────────────────────
-- Industry taxonomy seed. Idempotent : the UNIQUE constraint on
-- `slug` + `ON CONFLICT DO NOTHING` means a second run (e.g. after a
-- restore from a backup that already had these rows) is a no-op.
-- IDs are stable cuid-shaped strings so a teardown / restore cycle
-- keeps any cross-references intact ; if an admin renames a row via
-- the UI, the rename is preserved (we only ON CONFLICT skip).

INSERT INTO "Industry" ("id", "slug", "displayName", "createdAt", "updatedAt") VALUES
  ('ind_aerospace',                  'aerospace',                  'Aerospace',                  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_agriculture',                'agriculture',                'Agriculture',                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_food_and_beverages',         'food-and-beverages',         'Food and Beverages',         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_ai',                         'ai',                         'AI',                         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_automotive_industry',        'automotive-industry',        'Automotive Industry',        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_aviation_travel_tourism',    'aviation-travel-and-tourism','Aviation Travel and Tourism',CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_banking_capital_markets',    'banking-and-capital-markets','Banking and Capital Markets',CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_cities',                     'cities',                     'Cities',                     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_construction',               'construction',               'Construction',               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_consumption',                'consumption',                'Consumption',                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_digital_communications',     'digital-communications',     'Digital Communications',     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_education',                  'education',                  'Education',                  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_electricity',                'electricity',                'Electricity',                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_finance_and_insurance',      'finance-and-insurance',      'Finance and Insurance',      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_healthcare',                 'healthcare',                 'Healthcare',                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_investing',                  'investing',                  'Investing',                  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_manufacturing',              'manufacturing',              'Manufacturing',              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_media_entertainment_sport',  'media-entertainment-and-sport','Media, Entertainment and Sport', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_real_estate',                'real-estate-rental-leasing', 'Real Estate and Rental and Leasing', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_retail',                     'retail',                     'Retail',                     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_services',                   'services',                   'Services',                   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_transportation',             'transportation',             'Transportation',             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ind_wholesale',                  'wholesale',                  'Wholesale',                  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
