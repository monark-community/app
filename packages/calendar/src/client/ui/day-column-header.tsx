"use client";

const COLUMN_HEADER_HEIGHT = 64;

export { COLUMN_HEADER_HEIGHT };

export function DayColumnHeader({
  title,
  description,
  color,
}: {
  title: string;
  description?: string;
  color?: string;
}) {
  return (
    <div
      style={{ height: COLUMN_HEADER_HEIGHT }}
      className="flex flex-1 min-w-0 items-center gap-3 border-b border-border px-3"
    >
      <span
        className={`h-3 w-3 shrink-0 rounded-full ${!color ? "bg-primary" : ""}`}
        style={color ? { backgroundColor: color } : undefined}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}
