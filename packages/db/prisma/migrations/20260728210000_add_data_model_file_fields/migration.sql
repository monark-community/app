-- Adds the FILE (single) and ATTACHMENTS (many) Data Model field types. Values
-- are `StoredFile.id` soft references stored in DataRecord.data (no new table).
-- Enum-value additions are emitted outside a transaction (Prisma convention).
ALTER TYPE "DataFieldType" ADD VALUE 'FILE';
ALTER TYPE "DataFieldType" ADD VALUE 'ATTACHMENTS';
