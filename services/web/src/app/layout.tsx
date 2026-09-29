import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Nunito_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { BRANDING } from "@monark/branding";
import { ThemeProvider } from "@/lib/theme-provider";
import { TrpcProvider } from "@/lib/trpc-provider";
import { DevOverlay } from "@/components/dev-overlay/dev-overlay";
import { RouteProgress } from "@/components/route-progress";
import { Toaster } from "@/components/ui/sonner";
import { getBootstrapStatus } from "@/lib/bootstrap-gate";
import { brandThemeVars, type DarkColorMode } from "@/lib/brand-theme";
import "./globals.css";

// The brand CSS variables, set on <html> so the whole app follows the
// deployment's brand without each component knowing about branding. The
// root layout only supplies the per-theme brand inputs (`brandThemeVars` :
// `--brand-light` / `--brand-dark` + foregrounds + accents) and the surface
// tint ; globals.css maps them onto `--primary`, `--primary-foreground`,
// `--ring`, the sidebar, `--chart-1`, `--brand-primary` / `--brand-accent`
// / `--brand-foreground` (gradients, the avatar fallback, the notification
// badge) for the active theme, and derives every surface from `--primary`.
function brandStyle(
  orgPrimaryColor: string | null,
  orgPrimaryColorDark: string | null,
  orgPrimaryColorDarkMode: DarkColorMode,
  orgSurfaceTint: number | null,
): React.CSSProperties {
  // Two sources, one token set. The singleton org's `primaryColor` wins
  // when it's set ; otherwise the deployment's `BRANDING_PRIMARY`. Each
  // theme gets it adapted for contrast on its own background (a black
  // brand is lifted for dark mode, a white one darkened for light mode),
  // unless the org chose otherwise for dark mode (`primaryColorDarkMode` :
  // keep the primary as is, or use its exact `primaryColorDark`).
  //
  // `BRANDING_ACCENT` is chosen to pair with `BRANDING_PRIMARY`, so it is
  // honoured only while that primary is in use ; once the org sets its own
  // color, that color stands in as the accent (gradients, badge) too.
  const style: Record<string, string> = {
    ...brandThemeVars({
      primary: orgPrimaryColor ?? BRANDING.brandPrimary,
      darkMode: orgPrimaryColor ? orgPrimaryColorDarkMode : "adaptive",
      primaryDark: orgPrimaryColor ? orgPrimaryColorDark : null,
      accent: orgPrimaryColor ? null : BRANDING.brandAccent,
    }),
    // Scales the brand tint globals.css derives every surface from.
    "--surface-tint": String(surfaceTint(orgSurfaceTint)),
  };
  return style as React.CSSProperties;
}

// The org's own tint wins (set on the organization page), else the
// deployment's `BRANDING_SURFACE_TINT` ; clamped to 0..2, and anything
// unparseable falls back to the default subtle tint rather than breaking
// every surface.
function surfaceTint(orgSurfaceTint: number | null): number {
  const value = orgSurfaceTint ?? Number.parseFloat(BRANDING.surfaceTint);
  return Number.isFinite(value) ? Math.min(2, Math.max(0, value)) : 1;
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
  // First boot (no org yet) returns null and the starter colors
  // stand in. Best-effort : a transient api failure
  // falls through to the BRANDING defaults rather than crashing the
  // root layout.
  const status = await getBootstrapStatus();
  const orgPrimaryColor = status?.singletonPrimaryColor ?? null;
  const orgPrimaryColorDark = status?.singletonPrimaryColorDark ?? null;
  const orgPrimaryColorDarkMode = status?.singletonPrimaryColorDarkMode ?? "adaptive";
  const orgSurfaceTint = status?.singletonSurfaceTint ?? null;

  return (
    <html
      lang={locale}
      className={nunitoSans.variable}
      // Inline `style` for the brand CSS variables : simplest path that
      // keeps SSR + client in sync without an extra render cycle, and
      // takes precedence over the `:root` rules in globals.css.
      style={brandStyle(
        orgPrimaryColor,
        orgPrimaryColorDark,
        orgPrimaryColorDarkMode,
        orgSurfaceTint,
      )}
      // Which org the brand tokens above come from, so the organization
      // page only live-previews edits to the org that actually themes the app.
      data-brand-org={status?.singletonOrganizationId ?? undefined}
      // The deployment's tint, for previewing "reset to default" there.
      data-brand-default-tint={String(surfaceTint(null))}
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
