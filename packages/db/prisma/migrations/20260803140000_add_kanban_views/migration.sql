-- Saved MonarkQL queries per Kanban board (personal + shareable).
CREATE TABLE "KanbanView" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KanbanView_boardId_idx" ON "KanbanView"("boardId");
CREATE INDEX "KanbanView_organizationId_idx" ON "KanbanView"("organizationId");
CREATE INDEX "KanbanView_createdBy_idx" ON "KanbanView"("createdBy");

ALTER TABLE "KanbanView" ADD CONSTRAINT "KanbanView_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "KanbanBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KanbanView" ADD CONSTRAINT "KanbanView_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
