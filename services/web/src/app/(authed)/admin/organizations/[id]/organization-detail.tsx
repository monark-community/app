"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { OrganizationLogoEditor } from "@/components/organization-logo-editor"
import { trpc } from "@/lib/trpc"

export function OrganizationDetail({ orgId }: { orgId: string }) {
  const t = useTranslations("admin.organizations.detail")
  const utils = trpc.useUtils()
  const query = trpc.organizations.adminGet.useQuery(
    { id: orgId },
    { refetchOnWindowFocus: false },
  )
  const update = trpc.organizations.adminUpdate.useMutation({
    onSuccess: () => {
      void utils.organizations.adminGet.invalidate({ id: orgId })
      void utils.organizations.adminList.invalidate()
      toast.success(t("saved"))
    },
    onError: (error) => {
      toast.error(error.message || t("saveError"))
    },
  })

  // Tenancy mode drives single-tenant UX adaptations on this page :
  // the "Back to organizations" link is hidden when there's nowhere
  // meaningful to go back to (single-tenant has only one org and the
  // sidebar already lands on this page directly).
  const bootstrapStatus = trpc.organizations.bootstrapStatus.useQuery(
    undefined,
    { refetchOnWindowFocus: false, staleTime: Infinity },
  )
  const isSingleTenant = bootstrapStatus.data?.mode === "single"

  // Controlled inputs ; resync from the row whenever the underlying
  // query result rotates so a save (or another admin's change) doesn't
  // leave the form pointing at stale values.
  const [displayName, setDisplayName] = useState("")
  const [slug, setSlug] = useState("")
  const [primaryColor, setPrimaryColor] = useState("")

  useEffect(() => {
    if (!query.data) return
    setDisplayName(query.data.displayName)
    setSlug(query.data.slug)
    setPrimaryColor(query.data.primaryColor ?? "")
  }, [query.data])

  function onBlurDisplayName() {
    if (!query.data) return
    const value = displayName.trim()
    if (value === query.data.displayName) return
    if (value.length < 1 || value.length > 120) return
    update.mutate({ id: orgId, displayName: value })
  }

  function onBlurSlug() {
    if (!query.data) return
    const value = slug.trim().toLowerCase()
    if (value === query.data.slug) return
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)) {
      // Pull the value back to the previous valid one so the user
      // sees their bad input was discarded ; the toast carries the
      // why. Same pattern shaders the email input on /account.
      setSlug(query.data.slug)
      toast.error(t("invalidSlug"))
      return
    }
    if (value.length < 2 || value.length > 60) {
      setSlug(query.data.slug)
      toast.error(t("invalidSlug"))
      return
    }
    update.mutate({ id: orgId, slug: value })
  }

  function onBlurPrimaryColor() {
    if (!query.data) return
    const value = primaryColor.trim()
    const previous = query.data.primaryColor ?? ""
    if (value === previous) return
    if (value === "") {
      update.mutate({ id: orgId, primaryColor: null })
      return
    }
    if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) {
      setPrimaryColor(previous)
      toast.error(t("invalidColor"))
      return
    }
    update.mutate({ id: orgId, primaryColor: value })
  }

  async function onLogoChanged() {
    await utils.organizations.adminGet.invalidate({ id: orgId })
    await utils.organizations.adminList.invalidate()
  }

  function onLogoRemove() {
    update.mutate(
      { id: orgId, logoUrl: null },
      { onSuccess: () => toast.success(t("logoRemoved")) },
    )
  }

  return (
    <section className="space-y-4">
      {!isSingleTenant && (
        <div>
          <Link
            href="/admin/organizations"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t("back")}
          </Link>
        </div>
      )}

      {query.isLoading && (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      )}

      {query.isError && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("loadError")}
          </CardContent>
        </Card>
      )}

      {query.data && (
        <Card className="bg-transparent shadow-none">
          <CardHeader>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <OrganizationLogoEditor
              orgId={orgId}
              logoUrl={query.data.logoUrl}
              onChange={onLogoChanged}
              onRemove={onLogoRemove}
            />

            <div className="grid gap-2">
              <Label htmlFor="org-displayName">{t("labels.displayName")}</Label>
              <Input
                id="org-displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                onBlur={onBlurDisplayName}
                placeholder={t("placeholders.displayName")}
                maxLength={120}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="org-slug">{t("labels.slug")}</Label>
              <Input
                id="org-slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value.toLowerCase())}
                onBlur={onBlurSlug}
                placeholder={t("placeholders.slug")}
                className="font-mono"
                maxLength={60}
              />
              <p className="text-xs text-muted-foreground">{t("slugHint")}</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="org-primary-color">{t("labels.primaryColor")}</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="org-primary-color"
                  value={primaryColor}
                  onChange={(event) => setPrimaryColor(event.target.value)}
                  onBlur={onBlurPrimaryColor}
                  placeholder="#F0870C"
                  className="font-mono"
                />
                <span
                  aria-hidden
                  className="h-9 w-9 shrink-0 rounded-md border border-border"
                  style={{
                    backgroundColor:
                      primaryColor &&
                      /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(primaryColor)
                        ? primaryColor
                        : "transparent",
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("primaryColorHint")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
