export type CalendarEventTime = { hour: number; minute: number };

export type CalendarEventType = "STANDARD" | "PUNCTUAL" | "ALL_DAY";

export type CalendarEvent = {
  id: string;
  calendarId: string;
  startAt: Date;
  endAt: Date;
  title: string;
  description?: string;
  participants?: string[];
  location?: string;
  eventType?: CalendarEventType;
  color?: string;
  reminders?: number[];
};

export type DaySchedule = CalendarEvent[];

export type ColumnDef = {
  id: string;
  title: string;
  description?: string;
  avatarUrl?: string;
  color?: string;
  schedule: DaySchedule;
};

export type CalendarDef = {
  id: string;
  name: string;
  description?: string;
  color?: string;
  isPersonal?: boolean;
};

declare module "@monark/notifications/contracts" {
  interface NotificationDataRegistry {
    "calendar.event.reminder": {
      eventId: string;
      eventTitle: string;
      minutesBefore: number;
      minutesLabel: string;
      startAt: Date;
      startAtMs: number;
    };
  }
}
