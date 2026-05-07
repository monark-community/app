"use client"

import { useRef, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Pencil, RotateCcw, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { OrganizationLogo } from "@/components/organization-logo"
import { rewriteForCurrentHost } from "@/lib/dev-host-rewrite"
import {
  adminUploadOrgLogoAction,
  type AdminUploadOrgLogoErrorCode,
} from "@/app/(authed)/admin/organizations/actions"

type Props = {
  orgId: string
  logoUrl: string | null
  /**
   * Called after a successful upload or remove ; the caller invalidates
   * whatever queries hold a stale `logoUrl`. Synchronous-style hook so
   * an op like "refresh org list + detail in one shot" can chain
   * naturally on the parent.
   */
  onChange?: () => void | Promise<void>
  /**
   * Mutation that nulls the row's `logoUrl`. The editor itself doesn't
   * own the tRPC client (org logo lives on the same `adminUpdate`
   * mutation that handles displayName / slug / primaryColor), so we
   * accept the remove handler as a prop and let the parent wire it.
   */
  onRemove: () => void | Promise<void>
}

/**
 * Edit affordance for the organization logo, mirroring the self-service
 * user-avatar editor's UX : square logo with a hover overlay (Pencil
 * when set, Upload otherwise), tap to upload when empty, dropdown with
 * Replace + Remove when populated. File goes through the existing
 * `adminUploadOrgLogoAction` server pipeline (sharp 1:1 cover crop,
 * 512px, WebP).
 *
 * Layout assumes `lg` size from `OrganizationLogo` (80px) so the
 * affordance overlay reads at a comfortable size on the detail page.
 * Cards using a smaller logo should fall back to the display
 * component directly.
 */
export function OrganizationLogoEditor({
  orgId,
  logoUrl,
  onChange,
  onRemove,
}: Props) {
  const t = useTranslations("admin.organizations.detail")
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<AdminUploadOrgLogoErrorCode | null>(null)

  const displayUrl = logoUrl ? rewriteForCurrentHost(logoUrl) : null

  function pickFile() {
    inputRef.current?.click()
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setError(null)
    const formData = new FormData()
    formData.append("file", file)
    formData.append("orgId", orgId)
    startTransition(async () => {
      const result = await adminUploadOrgLogoAction(formData)
      if (!result.ok) {
        setError(result.errorCode)
      } else {
        await onChange?.()
        toast.success(t("logoUpdated"))
      }
    })
    if (inputRef.current) inputRef.current.value = ""
  }

  async function handleRemove() {
    setError(null)
    await onRemove()
  }

  const trigger = (
    <button
      type="button"
      aria-label={logoUrl ? t("logoEditAria") : t("logoUploadAria")}
      disabled={isPending}
      onClick={logoUrl ? undefined : pickFile}
      className="group relative cursor-pointer rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed"
    >
      <OrganizationLogo logoUrl={displayUrl} size="lg" />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 text-white opacity-0 transition-opacity duration-150 group-hover:bg-black/45 group-hover:opacity-100 group-focus-visible:bg-black/45 group-focus-visible:opacity-100 motion-reduce:transition-none"
      >
        {logoUrl ? (
          <Pencil className="h-5 w-5" />
        ) : (
          <Upload className="h-5 w-5" />
        )}
      </span>
    </button>
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        {logoUrl ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8}>
              <DropdownMenuItem onSelect={pickFile} disabled={isPending}>
                <RotateCcw className="h-4 w-4" aria-hidden />
                <span>
                  {isPending ? t("logoUploading") : t("logoReplace")}
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={handleRemove}
                disabled={isPending}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                <span>{t("logoRemove")}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          trigger
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={onFileChange}
        />
        <p className="text-xs text-muted-foreground">{t("logoHint")}</p>
      </div>
      {error && (
        <p className="text-xs text-destructive">{t(`logoErrors.${error}`)}</p>
      )}
    </div>
  )
}
