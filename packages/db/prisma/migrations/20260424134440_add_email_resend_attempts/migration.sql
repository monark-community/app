-- CreateTable
CREATE TABLE "EmailResendAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailResendAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailResendAttempt_userId_at_idx" ON "EmailResendAttempt"("userId", "at");

-- AddForeignKey
ALTER TABLE "EmailResendAttempt" ADD CONSTRAINT "EmailResendAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
