-- Kanban cards gain an inline checklist : an ordered JSON array of
-- { id, title, done } subtask items, edited as part of the card.
ALTER TABLE "KanbanCard" ADD COLUMN "subtasks" JSONB NOT NULL DEFAULT '[]';
