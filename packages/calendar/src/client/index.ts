// Public surface of @monark/calendar/client.
// Exports pure React UI primitives (no shadcn/radix imports).
// The full wired DayView lives in services/web and consumes these.

export { DayDateHeader } from "./ui/day-date-header";
export { DayTimeline } from "./ui/day-timeline";
export { DayColumnHeader, COLUMN_HEADER_HEIGHT } from "./ui/day-column-header";
export { CurrentTimeIndicator } from "./ui/current-time-indicator";
export { DayEventBlock } from "./ui/day-event-block";
export { DaySchedule } from "./ui/day-schedule";
export { DayColumn } from "./ui/day-column";
export { DayColumnsArea } from "./ui/day-columns-area";
export { useCurrentTime } from "./hooks/use-current-time";
export { HOUR_HEIGHT_PX, TOTAL_HEIGHT_PX } from "./constants";
// `DaySchedule` (the type, = CalendarEvent[]) is intentionally not re-exported here:
// it would collide with the `DaySchedule` component above. Import it from
// `@monark/calendar/contracts` if a consumer needs the type.
export type { CalendarDef, CalendarEvent, CalendarEventTime, ColumnDef } from "../contracts/types";
