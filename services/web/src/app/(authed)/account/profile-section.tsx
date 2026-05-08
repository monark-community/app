"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { Clock, Monitor, Moon, Sun } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
import { DirtyFormBar } from "@/components/dirty-form-bar"
import { ImageCropDialog } from "@/components/image-crop-dialog"
import { UserBanner, type UserBannerEditConfig } from "@/components/user-banner"
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

export function ProfileSection() {
  const t = useTranslations("account.profile")
  const tLocale = useTranslations("account.profile.locales")
  const tTheme = useTranslations("account.profile.themes")
  const tBanner = useTranslations("account.profile.readOnlyBanner")
  const tCommon = useTranslations("common")
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
  // in the danger tab.
  const readOnly = Boolean(me.data?.deletedAt)

  // Form drafts: explicit-save flow batches displayName / bio / locale
  // / theme into a single Save action surfaced by the DirtyFormBar.
  // The drafts re-sync from the source of truth whenever it changes
  // (`me.data` for name/bio, `currentLocale` for locale, `theme` for
  // theme) so external mutations don't leave the form pointing at
  // stale text.
  const [displayName, setDisplayName] = useState("")
  const [bio, setBio] = useState("")
  const [localeDraft, setLocaleDraft] = useState<string>(currentLocale)
  const [themeDraft, setThemeDraft] = useState<string>("system")
  const [mounted, setMounted] = useState(false)
  const [isSaving, startSaveTransition] = useTransition()
  const [, _startLocaleTransition] = useTransition()
  const [isAvatarPending, startAvatarTransition] = useTransition()
  const [avatarError, setAvatarError] = useState<UploadAvatarErrorCode | null>(null)
  // Source file user picked, awaiting crop. When non-null the crop dialog
  // is open ; on confirm we hand the cropped File back to the upload action.
  const [avatarSourceFile, setAvatarSourceFile] = useState<File | null>(null)
  const [isBannerPending, startBannerTransition] = useTransition()
  const [bannerError, setBannerError] = useState<UploadBannerErrorCode | null>(null)
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

  // Sync locale draft from the active app locale ; resyncs when an
  // external change wins (e.g. another tab posts a locale update).
  useEffect(() => {
    setLocaleDraft(currentLocale)
  }, [currentLocale])

  // Same for theme : draft mirrors the active theme as the source of
  // truth on first mount, then user picks shift only the draft until
  // the user hits Save.
  useEffect(() => {
    if (mounted) setThemeDraft(theme ?? "system")
  }, [mounted, theme])

  // Dirty-state derivation. Falsy when the form has nothing to save ;
  // the DirtyFormBar reads this to slide in/out.
  const dirty = useMemo(() => {
    if (!me.data) return false
    if (readOnly) return false
    const namePrev = me.data.displayName ?? ""
    const bioPrev = me.data.bio ?? ""
    const trimmedName = displayName.trim()
    const trimmedBio = bio.trim()
    if (trimmedName !== namePrev) return true
    if (trimmedBio !== bioPrev.trim()) return true
    if (localeDraft !== currentLocale) return true
    if (mounted && themeDraft !== (theme ?? "system")) return true
    return false
  }, [
    me.data,
    readOnly,
    displayName,
    bio,
    localeDraft,
    currentLocale,
    mounted,
    themeDraft,
    theme,
  ])

  function onCancel() {
    setDisplayName(me.data?.displayName ?? "")
    setBio(me.data?.bio ?? "")
    setLocaleDraft(currentLocale)
    setThemeDraft(theme ?? "system")
  }

  function onSave() {
    if (readOnly || !me.data) return
    const trimmedName = displayName.trim()
    const trimmedBio = bio.trim()

    // Validate in-form before any network call so the bar doesn't
    // flash through a no-op save when the input is invalid.
    if (trimmedName.length < 1 || trimmedName.length > 80) {
      toast.error(t("saved"))
      return
    }
    if (Array.from(bio).length > BIO_MAX) return

    const namePrev = me.data.displayName ?? ""
    const bioPrev = me.data.bio ?? ""
    const profilePatch: { displayName?: string; bio?: string | null } = {}
    if (trimmedName !== namePrev) profilePatch.displayName = trimmedName
    if (trimmedBio !== bioPrev.trim()) {
      profilePatch.bio = trimmedBio.length === 0 ? null : trimmedBio
    }

    const localeChanged =
      localeDraft !== currentLocale &&
      (localeDraft === "en" || localeDraft === "fr")
    const themeChanged =
      mounted && themeDraft !== (theme ?? "system")

    startSaveTransition(async () => {
      const tasks: Promise<unknown>[] = []
      if (Object.keys(profilePatch).length > 0) {
        tasks.push(updateProfile.mutateAsync(profilePatch))
      }
      if (localeChanged) {
        tasks.push(updateLocaleAction(localeDraft))
      }
      try {
        await Promise.all(tasks)
        if (themeChanged) setTheme(themeDraft)
        toast.success(t("saved"))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("saved"))
      }
    })
  }

  // The UserBanner edit affordance only hands us the picked File ; we
  // route it through the crop dialog before uploading (square 1:1 for
  // avatar, 3:1 for banner).
  function onAvatarFile(file: File) {
    if (readOnly) return
    setAvatarError(null)
    setAvatarSourceFile(file)
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

  function onBannerFile(file: File) {
    if (readOnly) return
    setBannerError(null)
    setBannerSourceFile(file)
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
  // (phone), the loopback URL is unreachable from the phone ; same
  // class of problem the tRPC + Supabase clients dodge with the
  // dev-host rewrite. Apply the same swap here. No-op in production.
  const avatarUrl = me.data?.avatarUrl
    ? rewriteForCurrentHost(me.data.avatarUrl)
    : null
  const bannerUrl = me.data?.bannerUrl
    ? rewriteForCurrentHost(me.data.bannerUrl)
    : null

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
  }

  return (
    <div className="space-y-5">
      <UserBanner
        bannerUrl={bannerUrl}
        avatarUrl={avatarUrl}
        displayName={me.data?.displayName ?? null}
        email={me.data?.email ?? null}
        subtitle={me.data?.email ?? null}
        edit={editConfig}
      />
      {(bannerError || avatarError) && (
        <div className="space-y-1">
          {bannerError && (
            <p className="text-xs text-destructive">
              {t(`bannerErrors.${bannerError}`)}
            </p>
          )}
          {avatarError && (
            <p className="text-xs text-destructive">
              {t(`avatarErrors.${avatarError}`)}
            </p>
          )}
        </div>
      )}

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

      <div className="grid gap-2">
        <Label htmlFor="displayName">{t("labels.displayName")}</Label>
        <Input
          id="displayName"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
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
          placeholder={t("placeholders.bio")}
          rows={4}
          disabled={readOnly}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="locale-select">{t("labels.locale")}</Label>
        <Select
          value={localeDraft}
          onValueChange={setLocaleDraft}
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
          value={mounted ? themeDraft : "system"}
          onValueChange={setThemeDraft}
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

      <DirtyFormBar
        open={dirty}
        onSave={onSave}
        onCancel={onCancel}
        saving={isSaving}
        saveLabel={t("save")}
        savingLabel={t("saving")}
        cancelLabel={tCommon("cancel")}
        message={tCommon("unsavedChanges")}
      />
    </div>
  )
}
