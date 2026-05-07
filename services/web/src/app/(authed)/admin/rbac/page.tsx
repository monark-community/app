import { getTranslations } from "next-intl/server"
import { RolesManager } from "./roles-manager"
import { SystemAdminsCard } from "./system-admins-card"

export default async function AdminRbacPage() {
  const t = await getTranslations("admin.rbac")
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <SystemAdminsCard />
      <RolesManager />
    </section>
  )
}
