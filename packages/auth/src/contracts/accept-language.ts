/**
 * Pick the highest-q-weighted Accept-Language tag we support, or
 * `undefined` when nothing matches. Pure ; safe to import from server
 * actions, edge functions, and the unit suite alike.
 *
 * The supported set is intentionally narrow — adding to it requires the
 * UI to ship matching message catalogs, so widening here without the
 * companion work would silently fall back to English at render time.
 */
export const SUPPORTED_LOCALES = ["en", "fr"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function pickLocaleFromHeader(
  header: string | null | undefined,
): SupportedLocale | undefined {
  if (!header) return undefined;
  const ranked = header
    .split(",")
    .map((entry) => {
      const [tag, ...params] = entry.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.split("=")[1] ?? "1") : 1;
      return { tag: (tag ?? "").toLowerCase(), q: Number.isFinite(q) ? q : 1 };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const primary = tag.split("-")[0] as SupportedLocale | undefined;
    if (primary && (SUPPORTED_LOCALES as readonly string[]).includes(primary)) {
      return primary;
    }
  }
  return undefined;
}
