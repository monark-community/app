"use client"

import { useTranslations } from "next-intl"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { trpc } from "@/lib/trpc"
import { EmailChangeForm } from "./email-change-form"

export function EmailSection() {
  const t = useTranslations("account.email")
  const me = trpc.users.me.useQuery(undefined, { refetchOnWindowFocus: false })
  const email = me.data?.email ?? ""

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="emailReadonly">{t("currentLabel")}</Label>
          {me.isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Input
              id="emailReadonly"
              value={email}
              readOnly
              disabled
              className="bg-muted"
            />
          )}
        </div>
        {email && <EmailChangeForm currentEmail={email} />}
      </CardContent>
    </Card>
  )
}
