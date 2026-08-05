"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, LogOut, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PanelHeader } from "@/components/patterns";
import { NotificationsList, useUnreadNotificationCount } from "@/components/notifications-list";
import { signOutAction } from "@/app/(anon)/signin/actions";
import { rewriteForCurrentHost } from "@/lib/dev-host-rewrite";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

// "About you" links land on the account-shell sub-routes.
const ABOUT_YOU_LINKS = [
  { id: "profile" as const, href: "/account/profile" },
  { id: "security" as const, href: "/account/security" },
  { id: "notifications" as const, href: "/account/notifications" },
];

type UserMenuTab = "notifications" | "account";

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
 * Avatar trigger + right-side drawer on the AppBar. The drawer is now TABBED:
 *
 *   - **Notifications** (default) — the in-app inbox (moved here from the old
 *     header bell), so the avatar is the single place for "what's happened".
 *   - **Account** — identity banner, placeholder rank/achievement cards, the
 *     account-shell links (Profile / Security / Notifications), and logout.
 *
 * The avatar itself carries the unread badge. Consolidating notifications onto
 * the avatar frees the bell's old AppBar slot for the AI assistant launcher.
 */
export function UserMenu() {
  const t = useTranslations("appBar.userMenu");
  const me = trpc.users.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<UserMenuTab>("notifications");
  const [isSigningOut, startSignOut] = useTransition();
  const unreadCount = useUnreadNotificationCount();
  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);

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
          className="relative cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
          {unreadCount > 0 && (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-(--brand-accent) px-1 text-[10px] font-semibold leading-none text-(--brand-foreground)"
            >
              {badgeLabel}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        hideClose
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        aria-label={t("aria")}
      >
        <SheetTitle className="sr-only">{headline || t("aria")}</SheetTitle>
        <PanelHeader
          title={headline || t("aria")}
          subtitle={displayName ? (email ?? undefined) : undefined}
          onClose={() => setOpen(false)}
        />

        {/* Tab bar : Notifications (default, actionable) · Account. */}
        <div className="flex shrink-0 border-b border-border" role="tablist" aria-label={t("aria")}>
          {(["notifications", "account"] as const).map((value) => {
            const active = tab === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(value)}
                className={cn(
                  "flex-1 border-b-2 px-4 py-2.5 text-sm transition-colors",
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`tabs.${value}` as const)}
              </button>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {tab === "notifications" ? (
            <NotificationsList onNavigate={() => setOpen(false)} />
          ) : (
            <div className="flex flex-1 flex-col overflow-y-auto pb-4">
              {/* Identity banner (image or brand-gradient fallback) that fades
                  into the background; the avatar overlaps its bottom edge. */}
              <div className="relative h-32 shrink-0">
                {bannerUrl ? (
                  <img
                    src={bannerUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,var(--brand-primary)_0%,var(--brand-accent)_100%)] opacity-30" />
                )}
                <div
                  aria-hidden
                  className="absolute inset-0 bg-linear-to-b from-transparent from-50% to-background"
                />
              </div>
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
                <div className="grid grid-cols-2 gap-3">
                  <ComingSoonCard />
                  <ComingSoonCard />
                </div>
                <ComingSoonCard className="h-20" />

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
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ComingSoonCard({ className }: { className?: string }) {
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
