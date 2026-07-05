"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, LogOut, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PanelHeader } from "@/components/patterns";
import { signOutAction } from "@/app/(anon)/signin/actions";
import { rewriteForCurrentHost } from "@/lib/dev-host-rewrite";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

// "About you" links land on the four account-shell sub-routes. Each
// tab is its own URL segment now ; clicking lands the user directly
// on that section without a redirect.
const ABOUT_YOU_LINKS = [
  { id: "profile" as const, href: "/account/profile" },
  { id: "security" as const, href: "/account/security" },
  { id: "notifications" as const, href: "/account/notifications" },
];

function initialsFromName(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const source = (name ?? email ?? "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0]! + parts[1][0]!).toUpperCase();
  }
  const first = parts[0] ?? source;
  return first.slice(0, 2).toUpperCase();
}

/**
 * Avatar trigger + right-side drawer shown on the right of the
 * AppBar. Clicking the avatar opens a Sheet that overlays the page,
 * sliding in from the right edge. The drawer holds :
 *
 *   - identity header (avatar + display name)
 *   - two side-by-side "rank" placeholder cards (Monark Rank /
 *     LedgerLift Rank) — empty bodies until the rank module ships
 *   - an "Achievements" placeholder card with an empty grid of slots
 *   - "About you" navigation block linking to the three account-shell
 *     tabs (Profile / Security / Notifications)
 *   - logout button anchored at the bottom
 *
 * Replaces the previous DropdownMenu surface so we have room to host
 * the gamification widgets the user-page design surfaces. The bell
 * stays a separate sibling in the AppBar ; this component is only
 * the user-identity drawer.
 */
export function UserMenu() {
  const t = useTranslations("appBar.userMenu");
  const me = trpc.users.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const [open, setOpen] = useState(false);
  const [isSigningOut, startSignOut] = useTransition();

  // Rewrites a loopback Supabase Storage URL to the current LAN host
  // so phone-from-LAN dev sessions can actually load the avatar ;
  // no-op in production. See `lib/dev-host-rewrite.ts`.
  const avatarUrl = me.data?.avatarUrl ? rewriteForCurrentHost(me.data.avatarUrl) : null;
  const bannerUrl = me.data?.bannerUrl ? rewriteForCurrentHost(me.data.bannerUrl) : null;
  const displayName = me.data?.displayName ?? null;
  const email = me.data?.email ?? null;
  const initials = initialsFromName(displayName, email);
  const headline = displayName ?? email ?? "";

  function onSignOut() {
    startSignOut(async () => {
      await signOutAction("local");
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={t("triggerAria")}
          className="cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Avatar className="h-8 w-8">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
            <AvatarFallback
              className={
                avatarUrl
                  ? "text-[11px]"
                  : "bg-[linear-gradient(135deg,var(--brand-primary)_0%,var(--brand-accent)_100%)] text-(--brand-foreground)"
              }
            >
              {avatarUrl ? initials : <User className="h-4 w-4" aria-hidden />}
            </AvatarFallback>
          </Avatar>
        </button>
      </SheetTrigger>
      {/*
        Drop the SheetContent default p-6 + gap-4 so the drawer is a
        flush flex column : PanelHeader at the top, then the scroll
        region hard against it with no top padding, so the banner runs
        edge-to-edge right under the header. Logout lives in the content
        flow at the bottom (no sticky footer).
      */}
      <SheetContent
        side="right"
        hideClose
        className="flex w-full flex-col gap-0 p-0 sm:max-w-sm"
        aria-label={t("aria")}
      >
        <SheetTitle className="sr-only">{headline || t("aria")}</SheetTitle>
        <PanelHeader
          title={headline || t("aria")}
          subtitle={displayName ? (email ?? undefined) : undefined}
          onClose={() => setOpen(false)}
        />

        <div className="flex flex-1 flex-col overflow-y-auto pb-4">
          {/*
            Banner block : a fixed-height image (or brand-gradient
            fallback) at the top of the drawer. The bottom half fades
            from transparent to the background colour so the banner
            visually melts into the rest of the drawer body instead
            of cutting off with a hard edge ; the avatar + name row
            sits below the banner with a negative margin so its
            vertical midpoint lands exactly on the banner's bottom
            edge (half the row overlaps the banner, half sits over
            the now-fully-opaque background).
          */}
          <div className="relative h-32 shrink-0">
            {bannerUrl ? (
              <img src={bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-[linear-gradient(135deg,var(--brand-primary)_0%,var(--brand-accent)_100%)] opacity-30" />
            )}
            <div
              aria-hidden
              className="absolute inset-0 bg-linear-to-b from-transparent from-50% to-background"
            />
          </div>
          {/*
            Identity avatar, anchored to the banner's bottom-left and scaled
            up from that corner. `-mt-14` pulls the h-20 (80px) avatar up so
            its bottom edge stays put — avatar height + negative margin stays a
            constant 24px, so nothing below shifts — while the extra height
            grows up into the banner.
          */}
          <div className="relative -mt-14 flex items-center gap-3 px-4">
            <Avatar className="h-20 w-20 shrink-0 border-4 border-background">
              {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
              <AvatarFallback
                className={
                  avatarUrl
                    ? "text-xl"
                    : "bg-[linear-gradient(135deg,var(--brand-primary)_0%,var(--brand-accent)_100%)] text-(--brand-foreground)"
                }
              >
                {avatarUrl ? initials : <User className="h-8 w-8" aria-hidden />}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="mt-4 flex flex-col gap-4 px-4">
            {/*
            Phase 2 placeholder cards. The Monark-specific surfaces
            (rank, achievements, etc.) live here once they ship ;
            until then we render empty "coming soon" cards so the
            drawer carries the right structure without making
            promises. Two side-by-side cards + one full-width card,
            mirroring the eventual rank-pair + achievements shape.
          */}
            <div className="grid grid-cols-2 gap-3">
              <ComingSoonCard />
              <ComingSoonCard />
            </div>
            <ComingSoonCard className="h-20" />

            {/* "About you" : the three account-shell tabs lifted onto
              the drawer for one-tap access. Closes the drawer on
              click so the user lands cleanly on the destination.
              Borderless rows separated by a thin top divider on the
              section ; each row keeps a hover background so the click
              target still reads. */}
            <div className="mt-2 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t("forYou")}</p>
              <ul className="border-t border-border pt-2">
                {ABOUT_YOU_LINKS.map((link) => (
                  <li key={link.id}>
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between rounded-md px-2 py-3 text-sm transition-colors hover:bg-muted/40 focus:outline-none focus-visible:bg-muted/40"
                    >
                      <span>{t(`links.${link.id}` as const)}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Logout : the drawer's terminal action, now in content flow
                (no footer). Full-width so it still reads as terminal. */}
            <Button
              type="button"
              variant="default"
              className="mt-2 w-full justify-center"
              onClick={onSignOut}
              disabled={isSigningOut}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              <span>{isSigningOut ? t("signingOut") : t("signOut")}</span>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ComingSoonCard({ className }: { className?: string }) {
  // Empty placeholder card with just a centred "Coming soon" line.
  // Used in the user drawer to hold space for the Monark-specific
  // surfaces (rank, achievements, …) the phase-2 work will fill in.
  // No labels here on purpose : we don't want to commit copy to the
  // future shape until the modules actually ship.
  const t = useTranslations("appBar.userMenu");
  return (
    <div
      className={cn(
        "flex h-24 items-center justify-center rounded-xl border border-border bg-card/40 p-3",
        className,
      )}
    >
      <p className="text-[11px] italic text-muted-foreground">{t("comingSoon")}</p>
    </div>
  );
}
