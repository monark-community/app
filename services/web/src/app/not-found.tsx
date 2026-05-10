import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BrandedAppLogo } from "@/components/branded-app-logo";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6 text-center">
        <BrandedAppLogo size={48} className="mx-auto" />
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("eyebrow")}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex justify-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/">{t("home")}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/account">{t("account")}</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
