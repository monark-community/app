import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { resolveDataModelByKey } from "../resolve-model";
import { RecordFullPage } from "./record-full-page";

export default async function DataRecordFullPage({
  params,
}: {
  params: Promise<{ modelKey: string; id: string }>;
}) {
  const { modelKey, id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;
  const api = createServerTrpcClient(sessionData.session.access_token);
  const model = await resolveDataModelByKey(api, modelKey);
  if (!model) notFound();
  const record = await api.dataModels.records.getById.query({ id }).catch(() => null);
  if (!record || record.dataModelId !== model.id) notFound();

  return <RecordFullPage model={model} recordId={id} />;
}
