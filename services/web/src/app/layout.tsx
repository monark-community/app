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
//     badge digits, etc.). Set unconditionally so the className stays
//     simple ; defaults to white to preserve the existing visual on
//     the starter orange / coral gradient, flips to a contrast-correct
//     value when the operator picks a light brand.
// Overriding all of them at the root `<html>` makes the whole app
// follow the operator's configured org color without each component
// having to know about org branding.
function brandStyle(orgPrimaryColor: string | null): React.CSSProperties {
  const primary = orgPrimaryColor ?? BRANDING.brandPrimary;
  const accent = orgPrimaryColor ?? BRANDING.brandAccent;
  // When an org primaryColor IS set we compute the contrast-correct
  // foreground (black or white) via WCAG relative luminance so primary
  // buttons + brand-painted chrome (avatar initials, badge digits) stay
  // legible regardless of the operator's color choice — a yellow /
  // pastel brand would render white-on-light otherwise. When the org
  // hasn't set a color we leave `--primary-foreground` to globals.css
  // (tuned for the starter orange) and pin `--brand-foreground` to
  // white so the starter avatar gradient keeps its existing look.
  const style: Record<string, string> = {
    "--brand-primary": primary,
    "--brand-accent": accent,
    "--brand-foreground": "#FFFFFF",
  };
  if (orgPrimaryColor) {
    const onPrimary = pickContrastForeground(orgPrimaryColor);
    style["--primary"] = orgPrimaryColor;
    style["--primary-foreground"] = onPrimary;
    style["--ring"] = orgPrimaryColor;
    style["--sidebar-primary"] = orgPrimaryColor;
    style["--sidebar-primary-foreground"] = onPrimary;
    style["--sidebar-ring"] = orgPrimaryColor;
    style["--chart-1"] = orgPrimaryColor;
    style["--brand-foreground"] = onPrimary;
  }
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
  );
}
