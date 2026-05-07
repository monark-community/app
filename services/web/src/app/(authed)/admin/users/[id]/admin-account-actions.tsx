"use client"

import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { Mail } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { PageSection } from "@/components/page-section"
import { adminSendPasswordResetAction } from "../admin-actions"

/**
 * "Send password reset email" action card on /admin/users/[id]. The
 * action triggers Supabase's standard `resetPasswordForEmail` against
 * the target user's address — same email + landing page the
 * self-service forgot-password flow uses, so the user always picks
 * their own new password ; admins never mutate the credential
 * directly. See [docs/todo/backlog.md](docs/todo/backlog.md) for the
 * pending email-change initiate work.
 */
export function AdminAccountActions({
  userId,
  email,
  disabled,
}: {
  userId: string
  email: string
  disabled?: boolean
}) {
  const t = useTranslations("admin.users.actions")
  const [isPending, startTransition] = useTransition()

  function onSendReset() {
    startTransition(async () => {
      const result = await adminSendPasswordResetAction({ userId })
      if (result.ok) {
        toast.success(t("passwordReset.success", { email }))
      } else if (result.errorCode === "forbidden") {
        toast.error(t("passwordReset.forbidden"))
      } else {
        toast.error(t("passwordReset.error"))
      }
    })
  }

  return (
    <PageSection title={t("title")} subtitle={t("subtitle")}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onSendReset}
        disabled={isPending || disabled}
      >
        <Mail className="h-4 w-4" aria-hidden />
        {isPending
          ? t("passwordReset.sending")
          : t("passwordReset.cta")}
      </Button>
    </PageSection>
  )
}
