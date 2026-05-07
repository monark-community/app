import type { ReactElement, ReactNode } from "react"
import { render, type RenderOptions } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import enMessages from "../src/messages/en.json"
import frMessages from "../src/messages/fr.json"

// Loaded statically so test bundles don't have to reach for the
// next-intl request runtime (which depends on Next's request context
// + cookies). Each test picks the locale it wants ; the default is
// English.
const MESSAGES = {
  en: enMessages,
  fr: frMessages,
} as const

export type TestLocale = keyof typeof MESSAGES

type TestIntlProviderProps = {
  locale?: TestLocale
  children: ReactNode
}

/**
 * Wraps children in a NextIntlClientProvider preloaded with the
 * package's real message catalogs. Component tests that call
 * `useTranslations(...)` see the actual production strings, not
 * placeholder keys.
 *
 * Pass a different `locale` prop to assert FR-side rendering.
 */
export function TestIntlProvider({
  locale = "en",
  children,
}: TestIntlProviderProps) {
  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      {children}
    </NextIntlClientProvider>
  )
}

type CustomRenderOptions = Omit<RenderOptions, "wrapper"> & {
  locale?: TestLocale
}

/**
 * `render(...)` shorthand that wraps the UI in `<TestIntlProvider>`.
 * Use this in every component test instead of `@testing-library/react`'s
 * raw `render` so `useTranslations` always has a provider.
 *
 * Re-exports the rest of testing-library so tests can pull `screen`,
 * `fireEvent`, etc. through this single import surface.
 */
export function renderWithIntl(
  ui: ReactElement,
  { locale = "en", ...options }: CustomRenderOptions = {},
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <TestIntlProvider locale={locale}>{children}</TestIntlProvider>
    ),
    ...options,
  })
}

// Re-export every other testing-library + user-event surface so
// tests have one import path : `import { renderWithIntl, screen } from
// "../../test-utils"`. Avoids the per-test boilerplate of importing
// from three different packages.
export * from "@testing-library/react"
export { default as userEvent } from "@testing-library/user-event"
