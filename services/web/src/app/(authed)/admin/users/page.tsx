import { getTranslations } from "next-intl/server";
import { UsersList } from "./users-list";

export default async function AdminUsersPage() {
  const t = await getTranslations("admin.users");
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <UsersList />
    </section>
  );
}
