import type { ReactNode } from "react"
import type { Metadata } from "next"
import { Nunito_Sans } from "next/font/google"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages, getTranslations } from "next-intl/server"
import { BRANDING } from "@monark/branding"
import { ThemeProvider } from "@/lib/theme-provider"
import { TrpcProvider } from "@/lib/trpc-provider"
import { DevOverlay } from "@/components/dev-overlay/dev-overlay"
import { RouteProgress } from "@/components/route-progress"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common")
  return {
    title: t("appName"),
    description: t("tagline"),
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html
      lang={locale}
      className={nunitoSans.variable}
      // CSS custom properties for branding colours injected at the root
      // so downstream consumers (NProgress bar, future brand-tinted
      // surfaces) follow `@monark/branding` without each rule referencing
      // the package directly. Inline `style` is the simplest path that
      // keeps SSR + client in sync without an extra render cycle.
      style={
        {
          "--brand-primary": BRANDING.brandPrimary,
          "--brand-accent": BRANDING.brandAccent,
        } as React.CSSProperties
      }
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <TrpcProvider>
              <RouteProgress />
              {children}
              <DevOverlay />
              <Toaster position="bottom-right" />
            </TrpcProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
