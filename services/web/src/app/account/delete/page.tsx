import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { MonarkLogo } from "@/components/monark-logo"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { DeleteForm } from "./delete-form"

export default async function DeleteAccountPage() {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user?.email) redirect("/signin")
  const email = data.user.email

  const t = await getTranslations("account.delete")

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex items-center gap-3">
        <MonarkLogo size={32} />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
      </header>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">{t("heading")}</CardTitle>
          <CardDescription>{t("lead")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t("bullets.memberships")}</li>
            <li>{t("bullets.content")}</li>
            <li>{t("bullets.retained")}</li>
            <li>{t("bullets.grace")}</li>
          </ul>

          <DeleteForm email={email} />
        </CardContent>
      </Card>
    </main>
  )
}
