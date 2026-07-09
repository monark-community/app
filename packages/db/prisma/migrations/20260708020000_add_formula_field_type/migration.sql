-- Add the FORMULA field type to the Data Model engine's field-type enum.
-- A FORMULA field is computed and read-only ; its value is derived from other
-- fields on the same record and recomputed on every write. No table change is
-- needed (formula values live in DataRecord.data JSONB like any other field) ;
-- only the enum gains a member.
ALTER TYPE "DataFieldType" ADD VALUE IF NOT EXISTS 'FORMULA';
