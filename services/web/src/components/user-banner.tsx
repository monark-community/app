"use client";

import Link from "next/link";
import { type ReactNode, useRef } from "react";
import { ArrowLeft, Pencil, RotateCcw, Trash2, Upload, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

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

export type UserBannerEditConfig = {
  /** Called when the user picks a banner file (after any crop dialog the caller wraps). */
  onBannerFile: (file: File) => void;
  /** Called when the user picks an avatar file. */
  onAvatarFile: (file: File) => void;
  /** Optional: clearing the banner. When omitted, the "Remove" item is hidden. */
  onRemoveBanner?: () => void;
  /** Optional: clearing the avatar. When omitted, the "Remove" item is hidden. */
  onRemoveAvatar?: () => void;
  bannerPending?: boolean;
  avatarPending?: boolean;
  /** Disable every affordance (banner + avatar) without hiding them. */
  readOnly?: boolean;
  labels: {
    bannerEditAria: string;
    bannerUploadAria: string;
    bannerReplace: string;
    bannerRemove: string;
    bannerUploading: string;
    avatarEditAria: string;
    avatarUploadAria: string;
    avatarReplace: string;
    avatarRemove: string;
    avatarUploading: string;
  };
};

/**
 * Hero banner used as the page header for `/account/profile` and
 * `/admin/users/[id]`. Mirrors the user-menu drawer's identity block
 * exactly so a user sees the same visual identity treatment in both
 * places.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ banner image / brand-gradient fallback       │  ← h-32 / h-40
 *   │   (bottom 50% fades to background)            │
 *   ├──────────────────────────────────────────────┤
 *   │  ◯ avatar   Display Name  [badge] [badge]    │  ← centered on the
 *   │             email@example.com                │     banner's bottom edge
 *   └──────────────────────────────────────────────┘
 *
 * Bleeds full-width via negative horizontal margins so the banner
 * stretches to the section shell's content edges (offset by the
 * caller's wrapper padding). Pass `className` on the wrapper if a
 * specific layout needs different bleed offsets.
 *
 * When `edit` is provided, the banner + avatar become click targets
 * with a hover overlay and a Replace / Remove dropdown ; the caller
 * stays in charge of any crop-dialog handling and the actual upload
 * mutation, since those differ between the self-service and admin
 * surfaces.
 */
export function UserBanner({
  bannerUrl,
  avatarUrl,
  displayName,
  email,
  subtitle,
  badges,
  action,
  backHref,
  backLabel,
  className,
  edit,
  bleed = true,
}: {
  bannerUrl: string | null;
  avatarUrl: string | null;
  displayName: string | null;
  email: string | null;
  /** Optional muted line below the display name (typically the email). */
  subtitle?: ReactNode;
  /** Inline badges to the right of the display name (status pills). */
  badges?: ReactNode;
  /** Trailing slot for an action button (edit, upload, etc.). */
  action?: ReactNode;
  /** When set, renders a back-arrow button absolute-positioned in the
   * banner's top-left corner so it doesn't push the avatar / headline
   * row down. The button has a translucent dark background so it stays
   * legible over both image banners and the brand-gradient fallback. */
  backHref?: string;
  backLabel?: string;
  className?: string;
  edit?: UserBannerEditConfig;
  /**
   * How the banner escapes its surrounding padding:
   *  - `true` (default) — full *viewport*-width via the `w-screen` bleed,
   *    for full-page surfaces (`/account/profile`, `/admin/users/[id]`).
   *  - `"container"` — bleed to the edges of a padded detail panel by
   *    cancelling its standard `px-6 py-6` gutter (`-mx-6 -mt-6`), so the
   *    banner spans the panel edge-to-edge while the fields below stay
   *    padded. The avatar / headline row re-pads itself to line up.
   *  - `false` — no bleed ; the banner sits at its container's width.
   */
  bleed?: boolean | "container";
}) {
  const initials = initialsFromName(displayName, email);
  const headline = displayName ?? email ?? "";
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const editable = Boolean(edit);
  const readOnly = edit?.readOnly ?? false;
  const viewportBleed = bleed === true;
  const containerBleed = bleed === "container";
  // With the viewport bleed on, the inner rows re-constrain to the page
  // content gutter ; otherwise they fill the (already narrow) container.
  const contentWrap = viewportBleed ? "mx-auto w-full max-w-2xl" : "w-full";
  // In container-bleed mode the section escaped the panel's `px-6`, so the
  // avatar / headline row re-adds that gutter to align with the fields
  // below ; other modes keep the row flush to its wrap.
  const contentPad = containerBleed ? "px-6" : "";

  function pickBanner() {
    if (!edit || readOnly) return;
    bannerInputRef.current?.click();
  }
  function pickAvatar() {
    if (!edit || readOnly) return;
    avatarInputRef.current?.click();
  }
  function onBannerFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file && edit) edit.onBannerFile(file);
    if (bannerInputRef.current) bannerInputRef.current.value = "";
  }
  function onAvatarFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file && edit) edit.onAvatarFile(file);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  }

  // The banner image rendering is identical across editable / read-only
  // ; only the wrapping element (button vs. div) changes.
  const bannerImage = bannerUrl ? (
    <img src={bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
  ) : (
    <div className="absolute inset-0 bg-[linear-gradient(135deg,var(--brand-primary)_0%,var(--brand-accent)_100%)] opacity-30" />
  );

  // Hover overlay (pencil / upload icon) shown on the editable banner.
  const bannerHoverOverlay = editable && !readOnly && (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-opacity duration-150 group-hover:bg-black/35 group-hover:opacity-100 group-focus-visible:bg-black/35 group-focus-visible:opacity-100 motion-reduce:transition-none"
    >
      {bannerUrl ? <Pencil className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
    </span>
  );

  // The fade-to-background gradient that smooths the banner into the
  // page body. Lives above the image, below the hover overlay.
  const bannerFade = (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent from-50% to-background"
    />
  );

  let bannerSurface: ReactNode;
  if (!edit) {
    bannerSurface = (
      <div className="relative h-32 sm:h-40">
        {bannerImage}
        {bannerFade}
      </div>
    );
  } else {
    const trigger = (
      <button
        type="button"
        aria-label={bannerUrl ? edit.labels.bannerEditAria : edit.labels.bannerUploadAria}
        disabled={edit.bannerPending || readOnly}
        onClick={bannerUrl ? undefined : pickBanner}
        className="group absolute inset-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:cursor-not-allowed"
      >
        <span className="absolute inset-0 overflow-hidden">{bannerImage}</span>
        {bannerHoverOverlay}
      </button>
    );
    const wrapped =
      bannerUrl && edit.onRemoveBanner ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8}>
            <DropdownMenuItem onSelect={pickBanner} disabled={edit.bannerPending || readOnly}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              <span>
                {edit.bannerPending ? edit.labels.bannerUploading : edit.labels.bannerReplace}
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => edit.onRemoveBanner?.()}
              disabled={edit.bannerPending || readOnly}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              <span>{edit.labels.bannerRemove}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        trigger
      );
    bannerSurface = (
      <div className="relative h-32 sm:h-40">
        {wrapped}
        {bannerFade}
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={onBannerFileChange}
        />
      </div>
    );
  }

  const avatarVisual = (
    <Avatar className="h-16 w-16 shrink-0 border-4 border-background sm:h-20 sm:w-20">
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
      <AvatarFallback
        className={
          avatarUrl
            ? "text-base"
            : "bg-[linear-gradient(135deg,var(--brand-primary)_0%,var(--brand-accent)_100%)] text-(--brand-foreground)"
        }
      >
        {avatarUrl ? initials : <User className="h-7 w-7" aria-hidden />}
      </AvatarFallback>
    </Avatar>
  );

  let avatarBlock: ReactNode = avatarVisual;
  if (edit) {
    const trigger = (
      <button
        type="button"
        aria-label={avatarUrl ? edit.labels.avatarEditAria : edit.labels.avatarUploadAria}
        disabled={edit.avatarPending || readOnly}
        onClick={avatarUrl ? undefined : pickAvatar}
        className="group relative cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed"
      >
        {avatarVisual}
        {!readOnly && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-1 flex items-center justify-center rounded-full bg-black/0 text-white opacity-0 transition-opacity duration-150 group-hover:bg-black/45 group-hover:opacity-100 group-focus-visible:bg-black/45 group-focus-visible:opacity-100 motion-reduce:transition-none"
          >
            {avatarUrl ? <Pencil className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
          </span>
        )}
      </button>
    );
    avatarBlock = (
      <>
        {avatarUrl && edit.onRemoveAvatar ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8}>
              <DropdownMenuItem onSelect={pickAvatar} disabled={edit.avatarPending || readOnly}>
                <RotateCcw className="h-4 w-4" aria-hidden />
                <span>
                  {edit.avatarPending ? edit.labels.avatarUploading : edit.labels.avatarReplace}
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => edit.onRemoveAvatar?.()}
                disabled={edit.avatarPending || readOnly}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                <span>{edit.labels.avatarRemove}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          trigger
        )}
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={onAvatarFileChange}
        />
      </>
    );
  }

  return (
    <section
      className={cn(
        // Full-bleed hero. Below `xl` there are no SectionShell rails, so the
        // `w-screen` + `ml-[calc(50%-50vw)]` trick pulls the section to the
        // *viewport* edges regardless of how deeply it's nested in the
        // centered content column. At `xl+` SectionShell docks its content
        // into the region to the right of the fixed `w-72` (18rem) sidebar,
        // so the bleed must match : span from the sidebar's right edge to the
        // viewport's right edge (`w-[calc(100vw-18rem)]`, offset so its left
        // edge lands at 18rem). This keeps the hero — and its centered hover
        // pen — aligned with the docked content instead of spilling under the
        // sidebar. (Assumes the standard SectionShell dock ; the two full-page
        // banner surfaces both render under a sidebar.) The avatar / headline
        // row below re-constrains itself to the content gutter so it stays
        // anchored where the form fields sit. `-mt-8` flushes the top edge
        // against the AppBar (matching the layout's `pt-8`). `"container"`
        // bleed instead cancels a detail panel's `px-6 py-6` gutter ; `false`
        // leaves it at its container's width.
        viewportBleed
          ? "relative -mt-8 w-screen ml-[calc(50%-50vw)] xl:w-[calc(100vw-18rem)] xl:ml-[calc(30rem-50vw)]"
          : containerBleed
            ? "relative -mx-6 -mt-6"
            : "relative",
        className,
      )}
    >
      {bannerSurface}
      {backHref && (
        // Back button is wrapped in an inner constrained container so
        // it sits at the same horizontal position as the form fields
        // below ; without this it would jump to the actual viewport's
        // top-left corner, well outside the content area.
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
          <div className={contentWrap}>
            <Link
              href={backHref}
              aria-label={backLabel}
              className="pointer-events-auto mt-3 inline-flex h-8 w-8 items-center justify-center rounded-md bg-black/30 text-white backdrop-blur-sm transition-colors hover:bg-black/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:mt-4"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      )}
      <div className={cn("mx-auto w-full max-w-2xl", contentPad)}>
        <div className="relative -mt-8 flex items-end gap-3 sm:-mt-10">
          {avatarBlock}
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{headline}</h1>
              {badges}
            </div>
            {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0 pb-1">{action}</div>}
        </div>
      </div>
    </section>
  );
}
