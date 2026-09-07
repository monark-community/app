import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthScreen } from "@/components/auth-screen";
import { BrandedAppLogo } from "@/components/branded-app-logo";
import { Button } from "@/components/ui/button";

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
    <AuthScreen brand={<BrandedAppLogo size={36} />} title={t("title")} subtitle={t(key)}>
      <Button asChild variant="outline" className="w-full">
        <Link href="/signin">{t("retry")}</Link>
      </Button>
    </AuthScreen>
  );
}
