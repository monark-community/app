/**
 * Locale-aware "5 minutes ago" formatter via the platform `Intl.RelativeTimeFormat`.
 * No extra dependency. Buckets the diff into the largest unit that
 * resolves to >= 1 (so 90s reads as "2 minutes ago", not "90 seconds ago"),
 * which matches the typical inbox feel.
 *
 * Returns a present-tense "now" via the `numeric: "auto"` option for
 * sub-minute diffs ; `Intl` decides the right phrasing per locale (en
 * "now" / fr "maintenant", "yesterday" / "hier", etc.) without any local
 * special-case strings.
 */
export function formatRelativeTime(value: Date | string, locale: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86_400 * 30) return rtf.format(Math.round(diffSec / 86_400), "day");
  if (abs < 86_400 * 365) return rtf.format(Math.round(diffSec / (86_400 * 30)), "month");
  return rtf.format(Math.round(diffSec / (86_400 * 365)), "year");
}
