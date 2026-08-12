-- Fuzzy global search : the `pg_trgm` extension + GIN trigram indexes on the
-- text columns the command-palette search sources match on (via `word_similarity`
-- + `ILIKE`, see @monark/db's trigram helpers). Raw-SQL indexes — Prisma can't
-- express `gin_trgm_ops`, so like `DataRecord_data_gin` these read as phantom
-- drift in a future `migrate dev` and must be stripped from its output.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "WikiPage_title_trgm" ON "WikiPage" USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "WikiPage_contentText_trgm" ON "WikiPage" USING GIN ("contentText" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "KanbanCard_title_trgm" ON "KanbanCard" USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "KanbanCard_descriptionText_trgm" ON "KanbanCard" USING GIN ("descriptionText" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "CalendarEvent_title_trgm" ON "CalendarEvent" USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "CalendarEvent_description_trgm" ON "CalendarEvent" USING GIN (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "DataRecord_title_trgm" ON "DataRecord" USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Automation_name_trgm" ON "Automation" USING GIN (name gin_trgm_ops);
