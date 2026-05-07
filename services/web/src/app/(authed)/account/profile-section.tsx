"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { Clock, Monitor, Moon, Pencil, RotateCcw, Sun, Trash2, Upload, User } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
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
import { ImageCropDialog } from "@/components/image-crop-dialog"
import { rewriteForCurrentHost } from "@/lib/dev-host-rewrite"
import { trpc } from "@/lib/trpc"
import {
  removeAvatarAction,
  removeBannerAction,
  updateLocaleAction,
  uploadAvatarAction,
  uploadBannerAction,
  type UploadAvatarErrorCode,
  type UploadBannerErrorCode,
} from "./actions"

const BIO_MAX = 400

const LOCALES = [
  { value: "en", key: "en" as const },
  { value: "fr", key: "fr" as const },
]

function initialsFromName(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name ?? email ?? "").trim()
  if (!source) return "?"
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0]! + parts[1][0]!).toUpperCase()
  }
  const first = parts[0] ?? source
  return first.slice(0, 2).toUpperCase()
}

export function ProfileSection() {
  const t = useTranslations("account.profile")
  const tLocale = useTranslations("account.profile.locales")
  const tTheme = useTranslations("account.profile.themes")
  const tBanner = useTranslations("account.profile.readOnlyBanner")
  const currentLocale = useLocale()
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const utils = trpc.useUtils()
  const me = trpc.users.me.useQuery(undefined, { refetchOnWindowFocus: false })
  const updateProfile = trpc.users.updateProfile.useMutation({
    onSuccess: () => void utils.users.me.invalidate(),
  })
  // Disable every input + every action when the account is in the
  // 14-day deletion grace window. The user can SEE their profile but
  // not edit it ; cancellation is the only allowed change and lives
  // in the danger tab. The (authed) layout's deletion-redirect makes
  // sure mutations from other surfaces are unreachable in the first
  // place ; this is the in-tab affordance.
  const readOnly = Boolean(me.data?.deletedAt)

  const [displayName, setDisplayName] = useState("")
  const [bio, setBio] = useState("")
  const [mounted, setMounted] = useState(false)
  const [, startLocaleTransition] = useTransition()
  const [isAvatarPending, startAvatarTransition] = useTransition()
  const [avatarError, setAvatarError] = useState<UploadAvatarErrorCode | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Source file user picked, awaiting crop. When non-null the crop dialog
  // is open ; on confirm we hand the cropped File back to the upload action.
  const [avatarSourceFile, setAvatarSourceFile] = useState<File | null>(null)
  const [isBannerPending, startBannerTransition] = useTransition()
  const [bannerError, setBannerError] = useState<UploadBannerErrorCode | null>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const [bannerSourceFile, setBannerSourceFile] = useState<File | null>(null)

  // next-themes resolves the active theme client-side; gate the Select on
  // `mounted` so SSR doesn't render a "wrong" selected option on first paint.
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    setDisplayName(me.data?.displayName ?? "")
  }, [me.data?.displayName])

  useEffect(() => {
    setBio(me.data?.bio ?? "")
  }, [me.data?.bio])

  function onBlurDisplayName() {
    if (readOnly) return
    const value = displayName.trim()
    const previous = me.data?.displayName ?? ""
    if (value === previous) return
    if (value.length < 1 || value.length > 80) return
    updateProfile.mutate(
      { displayName: value },
      {
        onSuccess: () => {
          toast.success(t("saved"))
        },
      },
    )
  }

  function onBlurBio() {
    if (readOnly) return
    const previous = me.data?.bio ?? ""
    // Code-point length so emoji count once each, matching the counter.
    if (Array.from(bio).length > BIO_MAX) return
    const next = bio.trim()
    // Treat blank as null in both directions so a clear-then-blur correctly
    // wipes the field instead of saving an empty string.
    if (next === previous.trim()) return
    updateProfile.mutate(
      { bio: next.length === 0 ? null : next },
      {
        onSuccess: () => {
          toast.success(t("saved"))
        },
      },
    )
  }


  function onLocaleChange(next: string) {
    if (readOnly) return
    if (next === currentLocale) return
    if (next !== "en" && next !== "fr") return
    startLocaleTransition(async () => {
      await updateLocaleAction(next)
    })
  }

  function onPickAvatar() {
    if (readOnly) return
    fileInputRef.current?.click()
  }

  // The file input only captures the *source* image ; it goes straight
  // into the crop dialog. The actual upload kicks off when the user
  // confirms the crop in `onAvatarCropConfirm`.
  function onAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (readOnly) return
    const file = event.target.files?.[0]
    if (!file) return
    setAvatarError(null)
    setAvatarSourceFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function onAvatarCropConfirm(cropped: File) {
    if (readOnly) return
    setAvatarSourceFile(null)
    const formData = new FormData()
    formData.append("file", cropped)
    startAvatarTransition(async () => {
      const result = await uploadAvatarAction(formData)
      if (!result.ok) {
        setAvatarError(result.errorCode)
      } else {
        await utils.users.me.invalidate()
        toast.success(t("avatarUpdated"))
      }
    })
  }

  function onAvatarRemove() {
    if (readOnly) return
    setAvatarError(null)
    startAvatarTransition(async () => {
      const result = await removeAvatarAction()
      if (result.ok) {
        await utils.users.me.invalidate()
        toast.success(t("avatarRemoved"))
      }
    })
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
    setBannerSourceFile(file)
    if (bannerInputRef.current) bannerInputRef.current.value = ""
  }

  function onBannerCropConfirm(cropped: File) {
    if (readOnly) return
    setBannerSourceFile(null)
    const formData = new FormData()
    formData.append("file", cropped)
    startBannerTransition(async () => {
      const result = await uploadBannerAction(formData)
      if (!result.ok) {
        setBannerError(result.errorCode)
      } else {
        await utils.users.me.invalidate()
        toast.success(t("bannerUpdated"))
      }
    })
  }

  function onBannerRemove() {
    if (readOnly) return
    setBannerError(null)
    startBannerTransition(async () => {
      const result = await removeBannerAction()
      if (result.ok) {
        await utils.users.me.invalidate()
        toast.success(t("bannerRemoved"))
      }
    })
  }

  // Avatar / banner URLs are stored as full Supabase Storage URLs
  // baked at upload time (e.g. `http://127.0.0.1:54321/storage/v1/...`
  // in local dev). When the current request is from a LAN device
  // (phone), the loopback URL is unreachable from the phone — same
  // class of problem the tRPC + Supabase clients dodge with the
  // dev-host rewrite. Apply the same swap here so the `<img>` src
  // hits the dev machine instead of the phone's own loopback. No-op
  // in production where stored URLs already point at the public
  // Supabase Storage host.
  const avatarUrl = me.data?.avatarUrl
    ? rewriteForCurrentHost(me.data.avatarUrl)
    : null
  const bannerUrl = me.data?.bannerUrl
    ? rewriteForCurrentHost(me.data.bannerUrl)
    : null
  const initials = initialsFromName(me.data?.displayName ?? null, me.data?.email ?? null)

  return (
    <Card className="overflow-hidden bg-transparent shadow-none">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {readOnly && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-400/5 p-3">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
            <div className="flex-1 space-y-2">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-amber-500">
                  {tBanner("title")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tBanner("subtitle")}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push("/account/danger")}
              >
                {tBanner("cta")}
              </Button>
            </div>
          </div>
        )}
        {/*
          Banner area: bleeds to the card edges via -mx-6, sits as the
          visual header of the form. The avatar floats out and is centered
          on the banner's bottom edge (Twitter-style: half above, half
          below). A faint brand-orange gradient stands in when no banner
          is set.

          Important: the banner *image* lives in its own absolute-positioned
          clipper so the rounded edges + object-cover stay tidy, but the
          banner's outer box does NOT have `overflow-hidden` ; otherwise
          the avatar's bottom half gets clipped instead of overlapping the
          card content below.
        */}
        <div className="-mx-6 -mt-2">
          <div className="relative h-32 md:h-40">
            {/*
              Banner: the whole surface is the click target. With a banner
              already set, clicking opens a dropdown (Replace / Remove) ;
              with no banner, clicking goes straight to the file picker
              since "Upload" is the only action and a one-item menu is
              dead weight. Same conditional applies to the avatar below.
            */}
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
                        {isBannerPending
                          ? t("bannerUploading")
                          : t("bannerReplace")}
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
            {/*
              Avatar centered on the banner's bottom edge: half above, half
              below. h-20 = 80px tall, so -bottom-10 (-40px) puts the
              vertical midpoint exactly on the banner edge.

              Edit affordance lives on the avatar itself: hovering reveals
              a darker overlay with a pencil icon (or upload icon when no
              avatar is set) ; clicking opens a dropdown with the
              Replace/Remove actions.
            */}
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
                      {/*
                        Two fallback shapes share the same slot:
                        - When the user has set an avatarUrl that fails to
                          load (broken link, network), Radix renders this
                          fallback ; we show their initials over a muted bg.
                        - When the user has *no* avatarUrl at all (we omit
                          AvatarImage entirely), the brand-gradient + user
                          icon stands in. The gradient is the same
                          orange→red used by the avatar's outer ring, so
                          the empty state visually anchors against it.
                      */}
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
                          <User className="h-9 w-9" aria-hidden />
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
          {/*
            Top padding here clears the avatar's bottom half (40px) before
            the next form row renders, so the avatar's bottom never
            collides with the displayName label on narrow viewports.

            Format / size hints used to live here ; they're gone in favour
            of the on-image hover affordance + crop dialog. We still
            surface upload errors though, since the user needs to know
            *why* their pick was rejected.
          */}
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
          <Label htmlFor="displayName">{t("labels.displayName")}</Label>
          <Input
            id="displayName"
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
            <Label htmlFor="bio">{t("labels.bio")}</Label>
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
            id="bio"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            onBlur={onBlurBio}
            placeholder={t("placeholders.bio")}
            rows={4}
            disabled={readOnly}
            // No native `maxLength` ; it counts UTF-16 code units, which
            // miscounts emoji. The submit-time validator + counter use
            // code-point length (`Array.from(...)`); we soft-warn via the
            // counter colour and zod rejects the mutation if the user
            // pastes past the limit.
          />
        </div>

        {/*
          Language + theme are now Select dropdowns instead of toggle
          rows. Cleaner for >2 options (theme adds "system" via next-themes
          ; locale stays at en/fr today but the same surface scales to
          additional languages later). Both fire on `onValueChange` and
          mirror the controlled value.
        */}
        <div className="grid gap-2">
          <Label htmlFor="locale-select">{t("labels.locale")}</Label>
          <Select
            value={currentLocale}
            onValueChange={onLocaleChange}
            disabled={readOnly}
          >
            <SelectTrigger id="locale-select" className="w-full">
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

        <div className="grid gap-2">
          <Label htmlFor="theme-select">{t("labels.theme")}</Label>
          <Select
            value={mounted ? (theme ?? "system") : "system"}
            onValueChange={(next) => setTheme(next)}
            disabled={readOnly}
          >
            <SelectTrigger id="theme-select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">
                <span className="flex items-center gap-2">
                  <Sun className="h-4 w-4" aria-hidden />
                  {tTheme("light")}
                </span>
              </SelectItem>
              <SelectItem value="dark">
                <span className="flex items-center gap-2">
                  <Moon className="h-4 w-4" aria-hidden />
                  {tTheme("dark")}
                </span>
              </SelectItem>
              <SelectItem value="system">
                <span className="flex items-center gap-2">
                  <Monitor className="h-4 w-4" aria-hidden />
                  {tTheme("system")}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>

      {/*
        Crop dialogs live at the card level so they sit above the rest of
        the form regardless of where the trigger was. Aspect 1:1 for the
        avatar, 3:1 for the banner (matching the server-side sharp crop
        ratio) so what the user sees in the dialog is what gets uploaded.
      */}
      <ImageCropDialog
        file={avatarSourceFile}
        aspect={1}
        onCancel={() => setAvatarSourceFile(null)}
        onCrop={onAvatarCropConfirm}
        title={t("avatarCropTitle")}
        description={t("avatarCropHint")}
      />
      <ImageCropDialog
        file={bannerSourceFile}
        aspect={3}
        onCancel={() => setBannerSourceFile(null)}
        onCrop={onBannerCropConfirm}
        title={t("bannerCropTitle")}
        description={t("bannerCropHint")}
      />
    </Card>
  )
}
