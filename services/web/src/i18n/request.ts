import { cookies } from "next/headers"
import { getRequestConfig } from "next-intl/server"
import { DEFAULT_LOCALE, isLocale } from "./config"

// Reads the user's preferred locale from the `NEXT_LOCALE` cookie (set by the
// locale switcher) and falls back to English. Called on every request by the
// next-intl server runtime; results are cached per-request.
export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const raw = cookieStore.get("NEXT_LOCALE")?.value
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE

  const messages = (await import(`../messages/${locale}.json`)).default

  return { locale, messages }
})
