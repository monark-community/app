-- Reserved "title" field convention: every Data Model owns a required TEXT
-- field with key `title` that backs DataRecord.title + the pinned primary
-- column. The admin no longer chooses a title field, so DataModel.titleFieldId
-- is dropped. Existing data is backfilled first so nothing regresses.

-- 1. Give every existing model a required TEXT "title" field if it lacks one.
--    Position -1000 sorts it first under `ORDER BY position ASC`.
INSERT INTO "DataField" (
  "id", "dataModelId", "key", "label", "type", "config",
  "required", "position", "indexed", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text, m."id", 'title', 'Title', 'TEXT'::"DataFieldType",
  '{}'::jsonb, true, -1000, false, now(), now()
FROM "DataModel" m
WHERE NOT EXISTS (
  SELECT 1 FROM "DataField" f
  WHERE f."dataModelId" = m."id" AND f."key" = 'title'
);

-- 2. Seed data.title from the denormalized DataRecord.title where absent, so
--    existing records keep their titles under the new convention.
UPDATE "DataRecord" r
SET "data" = jsonb_set(r."data", '{title}', to_jsonb(r."title"), true)
WHERE NOT (r."data" ? 'title');

-- 3. Drop the now-unused title-field pointer.
ALTER TABLE "DataModel" DROP COLUMN "titleFieldId";
