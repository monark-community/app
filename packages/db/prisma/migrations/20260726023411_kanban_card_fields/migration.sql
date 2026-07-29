-- CreateEnum
CREATE TYPE "KanbanCardPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterTable
ALTER TABLE "KanbanCard" ADD COLUMN     "estimate" INTEGER,
ADD COLUMN     "priority" "KanbanCardPriority",
ADD COLUMN     "reviewerId" TEXT;
