import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Nunito_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { BRANDING, isBrandingConfigured } from "@monark/branding";
import { ThemeProvider } from "@/lib/theme-provider";
import { TrpcProvider } from "@/lib/trpc-provider";
import { DevOverlay } from "@/components/dev-overlay/dev-overlay";
import { RouteProgress } from "@/components/route-progress";
import { Toaster } from "@/components/ui/sonner";
import { getBootstrapStatus } from "@/lib/bootstrap-gate";
import { pickContrastForeground } from "@/lib/color-contrast";
import "./globals.css";

// CSS variables that the whole UI keys off the primary brand color :
//   - `--primary` : shadcn primary buttons + `text-primary` / `bg-primary`
//   - `--primary-foreground` : text painted on top of `--primary`
//   - `--ring`    : focus rings on form controls
//   - `--sidebar-primary` / `--sidebar-ring` : drawer accents
//   - `--chart-1` : default first-series chart color
//   - `--brand-primary` / `--brand-accent` : gradient surfaces
//     (user-avatar fallback gradient, NProgress bar trailing edge,
//     notifications-bell count pill, etc.)
//   - `--brand-foreground` : text + icons painted on top of
//     `--brand-primary` / `--brand-accent` (avatar initials, count
//     badge digits, etc.). Always contrast-correct for the active
//     brand color.
// Overriding all of them at the root `<html>` makes the whole app
// follow the deployment's brand color without each component having to
// know about branding. The values in globals.css are the neutral
// fallback for surfaces rendered outside this layout (the component
// screenshot harness, for instance) ; the app itself always gets the
// tokens below.
function brandStyle(orgPrimaryColor: string | null): React.CSSProperties {
  // Two sources, one token set. The singleton org's `primaryColor` wins
  // when it's set ; otherwise the deployment's `BRANDING_PRIMARY`. Both
  // drive EVERY token below — previously the `--primary` family sat
  // behind an `if (orgPrimaryColor)`, so a deploy that set only
  // `BRANDING_PRIMARY` still rendered every button, focus ring, sidebar
  // accent and first chart series in the starter's own CSS color.
  const primary = orgPrimaryColor ?? BRANDING.brandPrimary;

  // The accent is the second stop of the gradient surfaces (NProgress,
  // the avatar fallback). The org record carries a primary only, so when
  // the deployment hasn't configured its own accent we let the org color
  // stand in for both stops rather than pairing the brand with the
  // starter's unrelated placeholder. A deployment that DID set
  // `BRANDING_ACCENT` gets it honoured — that used to be discarded the
  // moment an org existed, flattening every gradient to one flat color.
  const accent =
    orgPrimaryColor && !isBrandingConfigured("brandAccent")
      ? orgPrimaryColor
      : BRANDING.brandAccent;

  // Contrast-correct foreground (black or white) via WCAG relative
  // luminance, so primary buttons + brand-painted chrome (avatar
  // initials, badge digits) stay legible whatever color the operator
  // picked — a yellow or pastel brand would render white-on-light
  // otherwise.
  const onPrimary = pickContrastForeground(primary);

  const style: Record<string, string> = {
    "--brand-primary": primary,
    "--brand-accent": accent,
    "--brand-foreground": onPrimary,
    "--primary": primary,
    "--primary-foreground": onPrimary,
    "--ring": primary,
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": onPrimary,
    "--sidebar-ring": primary,
    "--chart-1": primary,
  };
  return style as React.CSSProperties;
}

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return {
    title: t("appName"),
    description: t("tagline"),
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  // Pull the singleton org's brand color (public procedure — safe pre-
  // auth) so anon screens (signin / signup / forgot-password) are
  // already on the deployer's brand color, not the starter orange.
  // Multi-tenant deploys + first-boot (no org yet) return null and the
  // starter colors stand in. Best-effort : a transient api failure
  // falls through to the BRANDING defaults rather than crashing the
  // root layout.
  const status = await getBootstrapStatus();
  const orgPrimaryColor = status?.singletonPrimaryColor ?? null;

  return (
    <html
      lang={locale}
      className={nunitoSans.variable}
      // Inline `style` for the brand CSS variables : simplest path that
      // keeps SSR + client in sync without an extra render cycle, and
      // takes precedence over the `:root` rules in globals.css.
      style={brandStyle(orgPrimaryColor)}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased overflow-y-hidden">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <TrpcProvider>
              <RouteProgress />
              {children}
              <DevOverlay />
              <Toaster position="bottom-center" />
            </TrpcProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
