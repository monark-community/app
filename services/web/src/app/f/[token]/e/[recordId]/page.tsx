import { notFound } from "next/navigation";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { PublicRecordDetail } from "./public-record-detail";

// Public, linkable detail view for one PUBLISHED board entry, at
// /f/<token>/e/<recordId>. Fetched anonymously ; the server returns only the
// board's read-allowed fields (private fields / submitter PII never leave).
export default async function PublicRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; recordId: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { token, recordId } = await params;
  const { k } = await searchParams;
  const data = await createServerTrpcClient()
    .dataModels.forms.public.record.query({ token, key: k, recordId })
    .catch(() => null);
  if (!data) notFound();

  return (
    <main className="min-h-dvh overflow-y-auto bg-muted/30 px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <PublicRecordDetail token={token} inviteKey={k ?? null} data={data} />
      </div>
    </main>
  );
}
