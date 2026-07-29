import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveDataModelByKey } from "./resolve-model";
import { RecordsList } from "./records-list";

export default async function DataModelRecordsPage({
  params,
}: {
  params: Promise<{ modelKey: string }>;
}) {
  const { modelKey } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;
  const api = createServerTrpcClient(sessionData.session.access_token);
  const model = await resolveDataModelByKey(api, modelKey);
  if (!model) notFound();

  return (
    // Desktop (`xl+`) : a full-height flex column — the header keeps its natural
    // height and the records list (its table wrapper marked `xl:flex-1`) fills
    // the rest, scrolling internally. Below `xl` : natural flow, the page
    // scrolls. `h-full` is gated to `xl` so `flex-1` children can't collapse
    // against the unbounded mobile parent.
    <section className="flex flex-col gap-4 xl:h-full">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{model.name}</h1>
        {model.description && (
          <p className="mt-1 text-sm text-muted-foreground">{model.description}</p>
        )}
      </header>
      <Suspense fallback={<Skeleton className="h-96 w-full xl:h-auto xl:min-h-0 xl:flex-1" />}>
        <RecordsList model={model} />
      </Suspense>
    </section>
  );
}
