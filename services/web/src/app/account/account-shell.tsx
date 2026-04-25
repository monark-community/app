"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { KeyRound, ShieldAlert, UserCircle2 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DangerZoneSection } from "./danger-zone-section"
import { EmailSection } from "./email-section"
import { PasswordSection } from "./password-section"
import { ProfileSection } from "./profile-section"
import { TotpSection } from "./totp-section"
import { TrustedDevicesSection } from "./trusted-devices-section"

type TabValue = "profile" | "security" | "danger"

function parseTab(raw: string | null): TabValue {
  if (raw === "security" || raw === "danger" || raw === "profile") return raw
  return "profile"
}

export function AccountShell() {
  const t = useTranslations("account.tabs")
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = parseTab(searchParams.get("tab"))

  function onTabChange(next: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (next === "profile") params.delete("tab")
    else params.set("tab", next)
    const query = params.toString()
    router.replace(`/account${query ? `?${query}` : ""}`, { scroll: false })
  }

  return (
    <Tabs
      value={current}
      onValueChange={onTabChange}
      orientation="vertical"
      className="flex flex-col gap-6 md:flex-row md:items-start"
    >
      <TabsList
        className="flex h-auto w-full flex-row items-stretch gap-1 bg-transparent p-0 md:w-48 md:flex-col md:items-stretch"
      >
        <TabsTrigger
          value="profile"
          className="flex-1 justify-start gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none md:flex-initial"
        >
          <UserCircle2 className="h-4 w-4" aria-hidden />
          <span>{t("profile")}</span>
        </TabsTrigger>
        <TabsTrigger
          value="security"
          className="flex-1 justify-start gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none md:flex-initial"
        >
          <KeyRound className="h-4 w-4" aria-hidden />
          <span>{t("security")}</span>
        </TabsTrigger>
        <TabsTrigger
          value="danger"
          className="flex-1 justify-start gap-2 data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none md:flex-initial"
        >
          <ShieldAlert className="h-4 w-4" aria-hidden />
          <span>{t("danger")}</span>
        </TabsTrigger>
      </TabsList>

      <div className="min-w-0 flex-1 space-y-6">
        <TabsContent value="profile" className="mt-0 space-y-6">
          <ProfileSection />
        </TabsContent>
        <TabsContent value="security" className="mt-0 space-y-6">
          <EmailSection />
          <PasswordSection />
          <TotpSection />
          <TrustedDevicesSection />
        </TabsContent>
        <TabsContent value="danger" className="mt-0 space-y-6">
          <DangerZoneSection />
        </TabsContent>
      </div>
    </Tabs>
  )
}
