import { getTranslations } from "next-intl/server"
import { MonarkLogo } from "@/components/monark-logo"

export default async function Home() {
  const t = await getTranslations("home")
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex max-w-xl flex-col items-center text-center">
        <MonarkLogo size={88} className="mb-6" />
        <h1 className="text-4xl font-semibold tracking-tight">{t("heading")}</h1>
        <p className="mt-3 text-muted-foreground">{t("subheading")}</p>
      </div>
    </main>
  )
}
