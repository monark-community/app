import { getTranslations } from "next-intl/server"
import { WebhooksManager } from "./webhooks-manager"

export default async function AdminWebhooksPage() {
  const t = await getTranslations("admin.webhooks")
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <WebhooksManager />
    </section>
  )
}
