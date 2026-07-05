import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { ProjectsList } from "./projects-list";

export default async function ProjectsPage() {
  const t = await getTranslations("admin.projects");
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <Suspense>
        <ProjectsList />
      </Suspense>
    </section>
  );
}
