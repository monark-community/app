import { getTranslations } from "next-intl/server";
import { BrandedAppLogo } from "@/components/branded-app-logo";

export default async function Home() {
  // Auth check happens once in `app/(authed)/layout.tsx`; pages under the
  // group can assume a session exists. Primary navigation now lives in the
  // AppBar's hamburger drawer, so this page only renders the activity-feed
  // content (placeholder welcome block for now).
  const t = await getTranslations("home");
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 py-16 text-center sm:px-6">
      <BrandedAppLogo size={88} className="mb-6" />
      <h1 className="text-4xl font-semibold tracking-tight">{t("heading")}</h1>
      <p className="mt-3 text-muted-foreground">{t("subheading")}</p>
    </main>
  );
}
