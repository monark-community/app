import { notFound } from "next/navigation";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { PublicForm } from "./public-form";

// Public, unauthenticated form page at /f/<token>. Lives outside the (authed)
// and (anon) route groups so it's reachable logged-out and doesn't bounce
// logged-in users away. The form definition is fetched anonymously (no bearer
// token) — trust is resolved server-side from the token + optional invite key.
export default async function PublicFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { token } = await params;
  const { k } = await searchParams;
  const form = await createServerTrpcClient()
    .dataModels.forms.public.get.query({ token, key: k })
    .catch(() => null);
  if (!form) notFound();

  return (
    <main className="min-h-dvh overflow-y-auto bg-muted/30 px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <PublicForm token={token} inviteKey={k ?? null} initial={form} />
      </div>
    </main>
  );
}
