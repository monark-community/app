-- How dark mode derives the brand color : 'same', 'adaptive' or 'custom'.
-- Null reads as 'adaptive'. Validated by the organizations router (zod),
-- kept as text so adding a mode never needs an enum migration.
ALTER TABLE "Organization" ADD COLUMN "primaryColorDarkMode" TEXT;

-- Orgs that already picked an explicit dark color keep using it.
UPDATE "Organization"
SET "primaryColorDarkMode" = 'custom'
WHERE "primaryColorDark" IS NOT NULL;
