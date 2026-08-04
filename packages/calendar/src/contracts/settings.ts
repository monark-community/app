import { z } from "zod";

export const CALENDAR_SETTINGS_MODULE = "calendar";
export const CALENDAR_SETTINGS_KEY = "view-settings";

export const calendarViewSettingsSchema = z.object({
  hideWeekends: z.boolean().default(false),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]).default(0),
  defaultView: z.enum(["day", "week", "month", "agenda"]).default("day"),
  timeFormat: z.enum(["12h", "24h"]).default("24h"),
  workingHours: z
    .object({
      enabled: z.boolean().default(false),
      startHour: z.number().int().min(0).max(23).default(9),
      endHour: z.number().int().min(1).max(24).default(17),
    })
    .default({ enabled: false, startHour: 9, endHour: 17 }),
});

export type CalendarViewSettings = z.infer<typeof calendarViewSettingsSchema>;

export const calendarViewSettingsPatchSchema = calendarViewSettingsSchema.partial();
export type CalendarViewSettingsPatch = z.infer<typeof calendarViewSettingsPatchSchema>;

export const DEFAULT_CALENDAR_VIEW_SETTINGS: CalendarViewSettings =
  calendarViewSettingsSchema.parse({});
