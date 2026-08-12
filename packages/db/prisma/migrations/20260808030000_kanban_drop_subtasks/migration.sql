-- The dedicated Kanban card `subtasks` field is retired : a card's checklist now
-- lives in its block-array `description` body (BlockNote `checkListItem` blocks),
-- and the card face derives its progress bar from those. Drop the column.
-- Pre-release, so no data is preserved (see block-editor.md, "No content backfill").

-- AlterTable
ALTER TABLE "KanbanCard" DROP COLUMN "subtasks";
