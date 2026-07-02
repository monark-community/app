-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('STANDARD', 'PUNCTUAL', 'ALL_DAY');

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "eventType" "CalendarEventType" NOT NULL DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "TrustedDevice" ALTER COLUMN "expiresAt" SET DEFAULT (now() + INTERVAL '400 days');
