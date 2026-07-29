import { getTranslations } from "next-intl/server";
import { SecretsList } from "./secrets-list";

export default async function AdminSecretsPage() {
  const t = await getTranslations("admin.secrets");
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <SecretsList />
    </section>
  );
}
