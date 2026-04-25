"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { trpc } from "@/lib/trpc"
import {
  removeAvatarAction,
  updateLocaleAction,
  uploadAvatarAction,
  type UploadAvatarErrorCode,
} from "./actions"

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
  const currentLocale = useLocale()
  const { resolvedTheme, setTheme } = useTheme()
  const utils = trpc.useUtils()
  const me = trpc.users.me.useQuery(undefined, { refetchOnWindowFocus: false })
  const updateProfile = trpc.users.updateProfile.useMutation({
    onSuccess: () => void utils.users.me.invalidate(),
  })

  const [displayName, setDisplayName] = useState("")
  const [mounted, setMounted] = useState(false)
  const [, startLocaleTransition] = useTransition()
  const [isAvatarPending, startAvatarTransition] = useTransition()
  const [avatarError, setAvatarError] = useState<UploadAvatarErrorCode | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // next-themes resolves the active theme client-side; gate the toggle UI
  // on mount so SSR doesn't render a "wrong" active state on first paint.
  useEffect(() => setMounted(true), [])
  const activeTheme = mounted ? resolvedTheme : null

  useEffect(() => {
    setDisplayName(me.data?.displayName ?? "")
  }, [me.data?.displayName])

  function onBlurDisplayName() {
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

  function onLocaleChange(next: string) {
    if (next === currentLocale) return
    if (next !== "en" && next !== "fr") return
    startLocaleTransition(async () => {
      await updateLocaleAction(next)
    })
  }

  function onPickAvatar() {
    fileInputRef.current?.click()
  }

  function onAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setAvatarError(null)
    const formData = new FormData()
    formData.append("file", file)
    startAvatarTransition(async () => {
      const result = await uploadAvatarAction(formData)
      if (!result.ok) {
        setAvatarError(result.errorCode)
      } else {
        await utils.users.me.invalidate()
        toast.success(t("avatarUpdated"))
      }
      if (fileInputRef.current) fileInputRef.current.value = ""
    })
  }

  function onAvatarRemove() {
    setAvatarError(null)
    startAvatarTransition(async () => {
      const result = await removeAvatarAction()
      if (result.ok) {
        await utils.users.me.invalidate()
        toast.success(t("avatarRemoved"))
      }
    })
  }

  const avatarUrl = me.data?.avatarUrl ?? null
  const initials = initialsFromName(me.data?.displayName ?? null, me.data?.email ?? null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start gap-4">
          <Avatar className="h-20 w-20">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
            <AvatarFallback className="text-sm">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-2">
            <Label>{t("labels.avatar")}</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onPickAvatar}
                disabled={isAvatarPending}
              >
                {isAvatarPending
                  ? t("avatarUploading")
                  : avatarUrl
                  ? t("avatarReplace")
                  : t("avatarUpload")}
              </Button>
              {avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onAvatarRemove}
                  disabled={isAvatarPending}
                  className="text-destructive hover:text-destructive"
                >
                  {t("avatarRemove")}
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={onAvatarChange}
            />
            <p className="text-xs text-muted-foreground">{t("avatarHint")}</p>
            {avatarError && (
              <p className="text-xs text-destructive">{t(`avatarErrors.${avatarError}`)}</p>
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
          />
        </div>

        <div className="grid gap-2">
          <Label>{t("labels.locale")}</Label>
          <div className="flex gap-2">
            {LOCALES.map((locale) => {
              const active = currentLocale === locale.value
              return (
                <Button
                  key={locale.value}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  onClick={() => onLocaleChange(locale.value)}
                  className="flex-1"
                >
                  {tLocale(locale.key)}
                </Button>
              )
            })}
          </div>
        </div>

        <div className="grid gap-2">
          <Label>{t("labels.theme")}</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={activeTheme === "light" ? "default" : "outline"}
              size="sm"
              onClick={() => setTheme("light")}
              className="flex-1 gap-2"
            >
              <Sun className="h-4 w-4" aria-hidden />
              {tTheme("light")}
            </Button>
            <Button
              type="button"
              variant={activeTheme === "dark" ? "default" : "outline"}
              size="sm"
              onClick={() => setTheme("dark")}
              className="flex-1 gap-2"
            >
              <Moon className="h-4 w-4" aria-hidden />
              {tTheme("dark")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
