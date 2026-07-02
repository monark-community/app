import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { ProjectForm, type ProjectFormInitial } from "../project-form";

export default async function ProjectEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;
  const api = createServerTrpcClient(sessionData.session.access_token);
  const project = await api.projects.getById.query({ id }).catch(() => null);
  if (!project) notFound();

  const t = await getTranslations("admin.projects.form");

  const initial: ProjectFormInitial = {
    id: project.id,
    title: project.title,
    slug: project.slug,
    url: project.url,
    description: project.description,
    publicStatus: project.publicStatus,
    keywords: project.keywords,
    industries: project.industries.map((ind) => ({
      id: ind.id,
      displayName: ind.displayName,
    })),
  };

  return (
    <section className="mx-auto max-w-250 space-y-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("back")}
      </Link>
      <ProjectForm mode="edit" initial={initial} />
    </section>
  );
}
