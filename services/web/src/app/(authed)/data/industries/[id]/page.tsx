import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { IndustryEditForm } from "./industry-edit-form";

export default async function IndustryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;
  const api = createServerTrpcClient(sessionData.session.access_token);
  const industry = await api.projects.industries.getById.query({ id }).catch(() => null);
  if (!industry) notFound();

  const t = await getTranslations("admin.industries");

  return (
    <section className="mx-auto max-w-250 space-y-6">
      <Link
        href="/data/industries"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("backToIndustries")}
      </Link>
      <IndustryEditForm
        id={industry.id}
        initialDisplayName={industry.displayName}
        initialSlug={industry.slug}
      />
    </section>
  );
}
