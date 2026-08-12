-- AlterTable
ALTER TABLE "DataModel" ADD COLUMN     "discussionsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "votingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DataRecordVote" (
    "id" TEXT NOT NULL,
    "dataRecordId" TEXT NOT NULL,
    "voterKey" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataRecordVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRecordComment" (
    "id" TEXT NOT NULL,
    "dataRecordId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DataRecordComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataRecordVote_dataRecordId_idx" ON "DataRecordVote"("dataRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "DataRecordVote_dataRecordId_voterKey_key" ON "DataRecordVote"("dataRecordId", "voterKey");

-- CreateIndex
CREATE INDEX "DataRecordComment_dataRecordId_createdAt_idx" ON "DataRecordComment"("dataRecordId", "createdAt");

-- AddForeignKey
ALTER TABLE "DataRecordVote" ADD CONSTRAINT "DataRecordVote_dataRecordId_fkey" FOREIGN KEY ("dataRecordId") REFERENCES "DataRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRecordVote" ADD CONSTRAINT "DataRecordVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRecordComment" ADD CONSTRAINT "DataRecordComment_dataRecordId_fkey" FOREIGN KEY ("dataRecordId") REFERENCES "DataRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRecordComment" ADD CONSTRAINT "DataRecordComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
