-- Configurable, event-driven achievements + a durable award outbox.
CREATE TYPE "AchievementOutboxStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Achievement_organizationId_idx" ON "Achievement"("organizationId");

CREATE TABLE "AchievementRule" (
    "id" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL DEFAULT 1,
    "subjectField" TEXT NOT NULL DEFAULT 'actorId',
    "match" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AchievementRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AchievementRule_achievementId_idx" ON "AchievementRule"("achievementId");
CREATE INDEX "AchievementRule_eventType_idx" ON "AchievementRule"("eventType");

CREATE TABLE "AchievementProgress" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AchievementProgress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AchievementProgress_ruleId_userId_key" ON "AchievementProgress"("ruleId", "userId");
CREATE INDEX "AchievementProgress_userId_idx" ON "AchievementProgress"("userId");

CREATE TABLE "AchievementAward" (
    "id" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AchievementAward_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AchievementAward_achievementId_userId_key" ON "AchievementAward"("achievementId", "userId");
CREATE INDEX "AchievementAward_userId_idx" ON "AchievementAward"("userId");
CREATE INDEX "AchievementAward_organizationId_idx" ON "AchievementAward"("organizationId");

CREATE TABLE "AchievementOutbox" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "AchievementOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "AchievementOutbox_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AchievementOutbox_status_nextAttemptAt_idx" ON "AchievementOutbox"("status", "nextAttemptAt");
CREATE INDEX "AchievementOutbox_organizationId_idx" ON "AchievementOutbox"("organizationId");

ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AchievementRule" ADD CONSTRAINT "AchievementRule_achievementId_fkey"
    FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AchievementProgress" ADD CONSTRAINT "AchievementProgress_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "AchievementRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AchievementAward" ADD CONSTRAINT "AchievementAward_achievementId_fkey"
    FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AchievementOutbox" ADD CONSTRAINT "AchievementOutbox_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
