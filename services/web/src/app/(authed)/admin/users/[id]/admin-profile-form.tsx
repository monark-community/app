"use client";

import { type ReactNode, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FieldRow } from "@/components/patterns";
import { UserBanner, type UserBannerEditConfig } from "@/components/user-banner";
import { rewriteForCurrentHost } from "@/lib/dev-host-rewrite";
import { trpc } from "@/lib/trpc";
import {
  adminUploadAvatarAction,
  adminUploadBannerAction,
  type AdminUploadAvatarErrorCode,
  type AdminUploadBannerErrorCode,
} from "../admin-actions";

const BIO_MAX = 400;
const LOCALES = [
  { value: "en", key: "en" as const },
  { value: "fr", key: "fr" as const },
];

type User = {
  id: string;
  email: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  localePreference: string;
  deletedAt: Date | string | null;
};

/**
 * Editable profile surface for `/admin/users/[id]`. Renders the
 * `UserBanner` hero with avatar / banner upload affordances baked in,
 * then the display-name / bio / locale form fields directly below.
 *
 * Image uploads skip the user-facing crop dialog (sharp's `fit: cover`
 * on the server still normalises the result) and go through the admin
 * server actions.
 *
 * Disabled when the target user is in the deletion grace window: admins
 * shouldn't poke fields on a row that's about to be anonymized.
 */
export function AdminProfileForm({
  user,
  badges,
  backHref,
  backLabel,
  bleed = true,
}: {
  user: User;
  /** Status pills (disabled / pendingDeletion) rendered next to the headline. */
  badges?: ReactNode;
  /** Back-button affordance rendered as an overlay in the banner's top-left. */
  backHref?: string;
  backLabel?: string;
  /** Passed to {@link UserBanner} — `"container"` bleeds to a panel's
   *  edges, `true` bleeds to the viewport (full page). */
  bleed?: boolean | "container";
}) {
  const t = useTranslations("admin.users.profileForm");
  const tLocale = useTranslations("account.profile.locales");
  const utils = trpc.useUtils();
  const updateProfile = trpc.users.adminUpdateProfile.useMutation({
    onSuccess: () => void utils.users.adminGetUser.invalidate({ userId: user.id }),
  });

  const readOnly = Boolean(user.deletedAt);

  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [isAvatarPending, startAvatarTransition] = useTransition();
  const [avatarError, setAvatarError] = useState<AdminUploadAvatarErrorCode | null>(null);
  const [isBannerPending, startBannerTransition] = useTransition();
  const [bannerError, setBannerError] = useState<AdminUploadBannerErrorCode | null>(null);

  // Re-sync the controlled inputs whenever the underlying row changes,
  // so a successful save (or another admin's change) doesn't leave the
  // form pointing at stale text.
  useEffect(() => {
    setDisplayName(user.displayName ?? "");
  }, [user.displayName]);
  useEffect(() => {
    setBio(user.bio ?? "");
  }, [user.bio]);

  function onBlurDisplayName() {
    if (readOnly) return;
    const value = displayName.trim();
    if (value === (user.displayName ?? "")) return;
    if (value.length < 1 || value.length > 80) return;
    updateProfile.mutate(
      { userId: user.id, displayName: value },
      { onSuccess: () => toast.success(t("saved")) },
    );
  }

  function onBlurBio() {
    if (readOnly) return;
    if (Array.from(bio).length > BIO_MAX) return;
    const next = bio.trim();
    const previous = (user.bio ?? "").trim();
    if (next === previous) return;
    updateProfile.mutate(
      { userId: user.id, bio: next.length === 0 ? null : next },
      { onSuccess: () => toast.success(t("saved")) },
    );
  }

  function onLocaleChange(next: string) {
    if (readOnly) return;
    if (next === user.localePreference) return;
    if (next !== "en" && next !== "fr") return;
    updateProfile.mutate(
      { userId: user.id, localePreference: next },
      { onSuccess: () => toast.success(t("saved")) },
    );
  }

  function onAvatarFile(file: File) {
    if (readOnly) return;
    setAvatarError(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("userId", user.id);
    startAvatarTransition(async () => {
      const result = await adminUploadAvatarAction(formData);
      if (!result.ok) {
        setAvatarError(result.errorCode);
      } else {
        await utils.users.adminGetUser.invalidate({ userId: user.id });
        toast.success(t("avatarUpdated"));
      }
    });
  }

  function onAvatarRemove() {
    if (readOnly) return;
    setAvatarError(null);
    updateProfile.mutate(
      { userId: user.id, avatarUrl: null },
      { onSuccess: () => toast.success(t("avatarRemoved")) },
    );
  }

  function onBannerFile(file: File) {
    if (readOnly) return;
    setBannerError(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("userId", user.id);
    startBannerTransition(async () => {
      const result = await adminUploadBannerAction(formData);
      if (!result.ok) {
        setBannerError(result.errorCode);
      } else {
        await utils.users.adminGetUser.invalidate({ userId: user.id });
        toast.success(t("bannerUpdated"));
      }
    });
  }

  function onBannerRemove() {
    if (readOnly) return;
    setBannerError(null);
    updateProfile.mutate(
      { userId: user.id, bannerUrl: null },
      { onSuccess: () => toast.success(t("bannerRemoved")) },
    );
  }

  const avatarUrl = user.avatarUrl ? rewriteForCurrentHost(user.avatarUrl) : null;
  const bannerUrl = user.bannerUrl ? rewriteForCurrentHost(user.bannerUrl) : null;

  const editConfig: UserBannerEditConfig = {
    onAvatarFile,
    onBannerFile,
    onRemoveAvatar: onAvatarRemove,
    onRemoveBanner: onBannerRemove,
    avatarPending: isAvatarPending,
    bannerPending: isBannerPending,
    readOnly,
    labels: {
      avatarEditAria: t("avatarEditAria"),
      avatarUploadAria: t("avatarUploadAria"),
      avatarReplace: t("avatarReplace"),
      avatarRemove: t("avatarRemove"),
      avatarUploading: t("avatarUploading"),
      bannerEditAria: t("bannerEditAria"),
      bannerUploadAria: t("bannerUploadAria"),
      bannerReplace: t("bannerReplace"),
      bannerRemove: t("bannerRemove"),
      bannerUploading: t("bannerUploading"),
    },
  };

  return (
    <div className="space-y-5">
      <UserBanner
        bannerUrl={bannerUrl}
        avatarUrl={avatarUrl}
        displayName={user.displayName}
        email={user.email}
        subtitle={user.email}
        badges={badges}
        backHref={backHref}
        backLabel={backLabel}
        bleed={bleed}
        edit={editConfig}
      />
      {(bannerError || avatarError) && (
        <div className="space-y-1">
          {bannerError && (
            <p className="text-xs text-destructive">{t(`bannerErrors.${bannerError}`)}</p>
          )}
          {avatarError && (
            <p className="text-xs text-destructive">{t(`avatarErrors.${avatarError}`)}</p>
          )}
        </div>
      )}

      <div className="@container space-y-5">
        <FieldRow label={t("labels.displayName")} htmlFor="admin-displayName">
          <Input
            id="admin-displayName"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            onBlur={onBlurDisplayName}
            placeholder={t("placeholders.displayName")}
            maxLength={80}
            disabled={readOnly}
          />
        </FieldRow>

        <FieldRow label={t("labels.bio")} htmlFor="admin-bio">
          <Textarea
            id="admin-bio"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            onBlur={onBlurBio}
            placeholder={t("placeholders.bio")}
            rows={4}
            disabled={readOnly}
          />
          <div className="flex justify-end">
            <span
              className={`text-xs ${
                Array.from(bio).length > BIO_MAX ? "text-destructive" : "text-muted-foreground"
              }`}
              aria-live="polite"
            >
              {Array.from(bio).length}/{BIO_MAX}
            </span>
          </div>
        </FieldRow>

        <FieldRow label={t("labels.locale")} htmlFor="admin-locale">
          <Select value={user.localePreference} onValueChange={onLocaleChange} disabled={readOnly}>
            <SelectTrigger id="admin-locale" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((locale) => (
                <SelectItem key={locale.value} value={locale.value}>
                  {tLocale(locale.key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      </div>
    </div>
  );
}
