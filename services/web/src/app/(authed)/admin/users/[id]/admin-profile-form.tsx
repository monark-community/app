"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Pencil, RotateCcw, Trash2, Upload, User as UserIcon } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { rewriteForCurrentHost } from "@/lib/dev-host-rewrite"
import { trpc } from "@/lib/trpc"
import {
  adminUploadAvatarAction,
  adminUploadBannerAction,
  type AdminUploadAvatarErrorCode,
  type AdminUploadBannerErrorCode,
} from "../admin-actions"

const BIO_MAX = 400
const LOCALES = [
  { value: "en", key: "en" as const },
  { value: "fr", key: "fr" as const },
]

function initialsFor(displayName: string | null, email: string): string {
  const source = (displayName ?? email).trim()
  if (!source) return "?"
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0]! + parts[1][0]!).toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

type User = {
  id: string
  email: string
  displayName: string | null
  bio: string | null
  avatarUrl: string | null
  bannerUrl: string | null
  localePreference: string
  deletedAt: Date | string | null
}

/**
 * Editable profile card for the admin /admin/users/[id] surface. Mirrors
 * the self-service ProfileSection's shape (banner + avatar + name + bio
 * + locale) but writes go through the admin tRPC procedures + admin
 * server actions, and image uploads skip the user-facing crop dialog
 * (sharp's `fit: cover` on the server still normalises the result).
 *
 * Disabled when the target user is in the deletion grace window — admins
 * shouldn't poke fields on a row that's about to be anonymized ; the
 * pattern matches the user-side read-only banner on /account.
 */
export function AdminProfileForm({ user }: { user: User }) {
  const t = useTranslations("admin.users.profileForm")
  const tLocale = useTranslations("account.profile.locales")
  const utils = trpc.useUtils()
  const updateProfile = trpc.users.adminUpdateProfile.useMutation({
    onSuccess: () =>
      void utils.users.adminGetUser.invalidate({ userId: user.id }),
  })

  const readOnly = Boolean(user.deletedAt)

  const [displayName, setDisplayName] = useState(user.displayName ?? "")
  const [bio, setBio] = useState(user.bio ?? "")
  const [isAvatarPending, startAvatarTransition] = useTransition()
  const [avatarError, setAvatarError] =
    useState<AdminUploadAvatarErrorCode | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isBannerPending, startBannerTransition] = useTransition()
  const [bannerError, setBannerError] =
    useState<AdminUploadBannerErrorCode | null>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  // Re-sync the controlled inputs whenever the underlying row changes,
  // so a successful save (or another admin's change) doesn't leave the
  // form pointing at stale text.
  useEffect(() => {
    setDisplayName(user.displayName ?? "")
  }, [user.displayName])
  useEffect(() => {
    setBio(user.bio ?? "")
  }, [user.bio])

  function onBlurDisplayName() {
    if (readOnly) return
    const value = displayName.trim()
    if (value === (user.displayName ?? "")) return
    if (value.length < 1 || value.length > 80) return
    updateProfile.mutate(
      { userId: user.id, displayName: value },
      { onSuccess: () => toast.success(t("saved")) },
    )
  }

  function onBlurBio() {
    if (readOnly) return
    if (Array.from(bio).length > BIO_MAX) return
    const next = bio.trim()
    const previous = (user.bio ?? "").trim()
    if (next === previous) return
    updateProfile.mutate(
      { userId: user.id, bio: next.length === 0 ? null : next },
      { onSuccess: () => toast.success(t("saved")) },
    )
  }

  function onLocaleChange(next: string) {
    if (readOnly) return
    if (next === user.localePreference) return
    if (next !== "en" && next !== "fr") return
    updateProfile.mutate(
      { userId: user.id, localePreference: next },
      { onSuccess: () => toast.success(t("saved")) },
    )
  }

  function onPickAvatar() {
    if (readOnly) return
    fileInputRef.current?.click()
  }

  function onAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (readOnly) return
    const file = event.target.files?.[0]
    if (!file) return
    setAvatarError(null)
    const formData = new FormData()
    formData.append("file", file)
    formData.append("userId", user.id)
    startAvatarTransition(async () => {
      const result = await adminUploadAvatarAction(formData)
      if (!result.ok) {
        setAvatarError(result.errorCode)
      } else {
        await utils.users.adminGetUser.invalidate({ userId: user.id })
        toast.success(t("avatarUpdated"))
      }
    })
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function onAvatarRemove() {
    if (readOnly) return
    setAvatarError(null)
    updateProfile.mutate(
      { userId: user.id, avatarUrl: null },
      { onSuccess: () => toast.success(t("avatarRemoved")) },
    )
  }

  function onPickBanner() {
    if (readOnly) return
    bannerInputRef.current?.click()
  }

  function onBannerChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (readOnly) return
    const file = event.target.files?.[0]
    if (!file) return
    setBannerError(null)
    const formData = new FormData()
    formData.append("file", file)
    formData.append("userId", user.id)
    startBannerTransition(async () => {
      const result = await adminUploadBannerAction(formData)
      if (!result.ok) {
        setBannerError(result.errorCode)
      } else {
        await utils.users.adminGetUser.invalidate({ userId: user.id })
        toast.success(t("bannerUpdated"))
      }
    })
    if (bannerInputRef.current) bannerInputRef.current.value = ""
  }

  function onBannerRemove() {
    if (readOnly) return
    setBannerError(null)
    updateProfile.mutate(
      { userId: user.id, bannerUrl: null },
      { onSuccess: () => toast.success(t("bannerRemoved")) },
    )
  }

  const avatarUrl = user.avatarUrl ? rewriteForCurrentHost(user.avatarUrl) : null
  const bannerUrl = user.bannerUrl ? rewriteForCurrentHost(user.bannerUrl) : null
  const initials = initialsFor(user.displayName, user.email)

  return (
    <Card className="overflow-hidden bg-transparent shadow-none">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="-mx-6 -mt-2">
          <div className="relative h-32 md:h-40">
            {(() => {
              const trigger = (
                <button
                  type="button"
                  aria-label={
                    bannerUrl ? t("bannerEditAria") : t("bannerUploadAria")
                  }
                  disabled={isBannerPending || readOnly}
                  onClick={bannerUrl ? undefined : onPickBanner}
                  className="group absolute inset-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:cursor-not-allowed"
                >
                  <span className="absolute inset-0 overflow-hidden">
                    {bannerUrl ? (
                      <img
                        src={bannerUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 bg-[linear-gradient(135deg,var(--brand-primary)_0%,var(--brand-accent)_100%)] opacity-15" />
                    )}
                  </span>
                  {!readOnly && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-opacity duration-150 group-hover:bg-black/35 group-hover:opacity-100 group-focus-visible:bg-black/35 group-focus-visible:opacity-100 motion-reduce:transition-none"
                    >
                      {bannerUrl ? (
                        <Pencil className="h-6 w-6" />
                      ) : (
                        <Upload className="h-6 w-6" />
                      )}
                    </span>
                  )}
                </button>
              )
              if (!bannerUrl) return trigger
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={8}>
                    <DropdownMenuItem
                      onSelect={onPickBanner}
                      disabled={isBannerPending || readOnly}
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden />
                      <span>
                        {isBannerPending ? t("bannerUploading") : t("bannerReplace")}
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={onBannerRemove}
                      disabled={isBannerPending || readOnly}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      <span>{t("bannerRemove")}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            })()}
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={onBannerChange}
            />
            <div className="absolute -bottom-10 left-6 z-10">
              {(() => {
                const trigger = (
                  <button
                    type="button"
                    aria-label={
                      avatarUrl ? t("avatarEditAria") : t("avatarUploadAria")
                    }
                    disabled={isAvatarPending || readOnly}
                    onClick={avatarUrl ? undefined : onPickAvatar}
                    className="group relative cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed"
                  >
                    <Avatar className="h-20 w-20">
                      {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
                      <AvatarFallback
                        className={
                          avatarUrl
                            ? "text-sm"
                            : "bg-[linear-gradient(135deg,var(--brand-primary)_0%,var(--brand-accent)_100%)] text-white"
                        }
                      >
                        {avatarUrl ? (
                          initials
                        ) : (
                          <UserIcon className="h-9 w-9" aria-hidden />
                        )}
                      </AvatarFallback>
                    </Avatar>
                    {!readOnly && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0.5 flex items-center justify-center rounded-full bg-black/0 text-white opacity-0 transition-opacity duration-150 group-hover:bg-black/45 group-hover:opacity-100 group-focus-visible:bg-black/45 group-focus-visible:opacity-100 motion-reduce:transition-none"
                      >
                        {avatarUrl ? (
                          <Pencil className="h-5 w-5" />
                        ) : (
                          <Upload className="h-5 w-5" />
                        )}
                      </span>
                    )}
                  </button>
                )
                if (!avatarUrl) return trigger
                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={8}>
                      <DropdownMenuItem
                        onSelect={onPickAvatar}
                        disabled={isAvatarPending || readOnly}
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden />
                        <span>
                          {isAvatarPending
                            ? t("avatarUploading")
                            : t("avatarReplace")}
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={onAvatarRemove}
                        disabled={isAvatarPending || readOnly}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        <span>{t("avatarRemove")}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              })()}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={onAvatarChange}
              />
            </div>
          </div>
          <div className="px-6 pt-12">
            {bannerError && (
              <p className="text-xs text-destructive">
                {t(`bannerErrors.${bannerError}`)}
              </p>
            )}
            {avatarError && (
              <p className="mt-1 text-xs text-destructive">
                {t(`avatarErrors.${avatarError}`)}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="admin-displayName">{t("labels.displayName")}</Label>
          <Input
            id="admin-displayName"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            onBlur={onBlurDisplayName}
            placeholder={t("placeholders.displayName")}
            maxLength={80}
            disabled={readOnly}
          />
        </div>

        <div className="grid gap-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="admin-bio">{t("labels.bio")}</Label>
            <span
              className={`text-xs ${
                Array.from(bio).length > BIO_MAX
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
              aria-live="polite"
            >
              {Array.from(bio).length}/{BIO_MAX}
            </span>
          </div>
          <Textarea
            id="admin-bio"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            onBlur={onBlurBio}
            placeholder={t("placeholders.bio")}
            rows={4}
            disabled={readOnly}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="admin-locale">{t("labels.locale")}</Label>
          <Select
            value={user.localePreference}
            onValueChange={onLocaleChange}
            disabled={readOnly}
          >
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
        </div>
      </CardContent>
    </Card>
  )
}
