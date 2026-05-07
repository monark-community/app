-- Tracks whether the user has been shown a "you used a recovery code"
-- reminder for a given used row. Lets the post-sign-in modal trigger on
-- (usedAt IS NOT NULL AND acknowledgedAt IS NULL) and survive sign-out.
ALTER TABLE "RecoveryCode" ADD COLUMN "acknowledgedAt" TIMESTAMP(3);
