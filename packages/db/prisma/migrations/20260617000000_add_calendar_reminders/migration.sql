-- CreateTable
CREATE TABLE "CalendarEventReminder" (
    "id" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "minutesBefore" INTEGER NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEventReminder_scheduledFor_notifiedAt_idx" ON "CalendarEventReminder"("scheduledFor", "notifiedAt");

-- CreateIndex
CREATE INDEX "CalendarEventReminder_calendarEventId_idx" ON "CalendarEventReminder"("calendarEventId");

-- CreateIndex
CREATE INDEX "CalendarEventReminder_organizationId_idx" ON "CalendarEventReminder"("organizationId");

-- AddForeignKey
ALTER TABLE "CalendarEventReminder" ADD CONSTRAINT "CalendarEventReminder_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventReminder" ADD CONSTRAINT "CalendarEventReminder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
