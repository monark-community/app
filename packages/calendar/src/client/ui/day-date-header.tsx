"use client";

export function DayDateHeader({ date, locale }: { date: Date; locale?: string }) {
  const weekday = new Intl.DateTimeFormat(locale ?? "en", { weekday: "short" })
    .format(date)
    .replace(/\.$/, "");
  const day = date.getDate();

  return (
    <div className="flex flex-col items-center justify-center gap-0.5 py-2">
      <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {weekday}
      </span>
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary">
        <span className="text-sm font-semibold text-primary-foreground">{day}</span>
      </div>
    </div>
  );
}
