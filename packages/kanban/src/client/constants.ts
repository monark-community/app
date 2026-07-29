// Shared board geometry. Every positioned primitive imports from here so the
// column width stays consistent across the board (the calendar keeps HOUR_HEIGHT_PX
// here for the same reason).

/** Fixed width of a board column, in px (Tailwind `w-72`). */
export const COLUMN_WIDTH_PX = 288;
