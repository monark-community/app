import { getTranslations } from "next-intl/server";
import { DataModelsList } from "./data-models-list";

export default async function AdminDataModelsPage() {
  const t = await getTranslations("admin.dataModels");
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <DataModelsList />
    </section>
  );
}
