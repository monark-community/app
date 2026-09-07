import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthScreen } from "@/components/auth-screen";
import { Button } from "@/components/ui/button";
import { BrandedAppLogo } from "@/components/branded-app-logo";

type Props = {
  searchParams: Promise<{ reason?: string }>;
};

function reasonKey(
  reason: string | undefined,
): "reasonMissing" | "reasonExpired" | "reasonInvalid" {
  if (reason === "missing") return "reasonMissing";
  if (reason === "otp_expired") return "reasonExpired";
  return "reasonInvalid";
}

export default async function ConfirmErrorPage({ searchParams }: Props) {
  const params = await searchParams;
  const t = await getTranslations("auth.confirmError");
  const key = reasonKey(params.reason);

  return (
    <AuthScreen>
      <div className="mb-8 flex flex-col items-center text-center">
        <BrandedAppLogo size={56} className="mb-4" />
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t(key)}</p>
      </div>
      <Button asChild variant="outline" className="w-full">
        <Link href="/signin">{t("retry")}</Link>
      </Button>
    </AuthScreen>
  );
}
