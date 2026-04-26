import { getTranslations } from "next-intl/server"

// Placeholder admin home; real admin surfaces (members view, role assignment,
// org settings) land with their own routes under this directory.
export default async function AdminHomePage() {
  const t = await getTranslations("admin")
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("placeholder")}</p>
    </main>
  )
}
