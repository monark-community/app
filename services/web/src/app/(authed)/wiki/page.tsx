import { getTranslations } from "next-intl/server";
import { BookText } from "lucide-react";

export default async function WikiIndexPage() {
  const t = await getTranslations("wiki");
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-2 px-4 py-24 text-center">
      <BookText className="h-8 w-8 text-muted-foreground" aria-hidden />
      <h2 className="text-lg font-semibold">{t("empty.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("empty.description")}</p>
    </div>
  );
}
