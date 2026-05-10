import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BrandedAppLogo } from "@/components/branded-app-logo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CheckEmailActions } from "./check-email-actions";

type Props = {
  searchParams: Promise<{ email?: string }>;
};

function redactEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 1) return `${local}***@${domain}`;
  return `${local[0]}***@${domain}`;
}

export default async function CheckEmailPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const t = await getTranslations("auth.checkEmail");

  if (data.user?.email_confirmed_at) {
    redirect("/");
  }

  const email = data.user?.email ?? params.email ?? null;

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandedAppLogo size={56} className="mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {email
              ? t.rich("subtitleWithEmail", {
                  email: redactEmail(email),
                  em: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
                })
              : t("subtitleNoEmail")}
          </p>
        </div>
        <CheckEmailActions email={email} />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("wrongEmail")}{" "}
          <a href="/signup" className="font-medium text-primary hover:underline">
            {t("signUpAgain")}
          </a>
        </p>
      </div>
    </main>
  );
}
