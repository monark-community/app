"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { FieldValue, type PublicField } from "../../public-form";
import { Discussion, VotePill, useEngageIdentity } from "../../engagement";

interface DetailData {
  modelName: string;
  readFields: PublicField[];
  entry: { id: string; title: string; updatedAt: string | Date; data: Record<string, unknown> };
  votingEnabled: boolean;
  discussionsEnabled: boolean;
  voteCount: number;
  hasVoted: boolean;
  commentCount: number;
}

export function PublicRecordDetail({
  token,
  inviteKey,
  data,
}: {
  token: string;
  inviteKey: string | null;
  data: DetailData;
}) {
  const t = useTranslations("public.form");
  const backHref = `/f/${token}${inviteKey ? `?k=${inviteKey}` : ""}`;
  const { canEngage } = useEngageIdentity(inviteKey);

  // The page's initial fetch is server-anonymous, so `hasVoted` is unknown ;
  // reconcile it with a session-carrying client query (seeded by the props).
  const voteState = trpc.dataModels.forms.public.voteState.useQuery(
    { token, key: inviteKey ?? undefined, recordId: data.entry.id },
    {
      enabled: data.votingEnabled,
      refetchOnWindowFocus: false,
      initialData: { count: data.voteCount, hasVoted: data.hasVoted },
    },
  ).data ?? { count: data.voteCount, hasVoted: data.hasVoted };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <Link
        href={backHref}
        className="mb-4 -ml-1 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
        {t("backToBoard")}
      </Link>

      <div className="flex items-start gap-4">
        {data.votingEnabled && (
          <VotePill
            token={token}
            inviteKey={inviteKey}
            recordId={data.entry.id}
            count={voteState.count}
            hasVoted={voteState.hasVoted}
            canEngage={canEngage}
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{data.entry.title || "—"}</h1>
          <p className="mb-6 text-sm text-muted-foreground">{data.modelName}</p>
        </div>
      </div>

      {data.readFields.length > 0 && (
        <dl className="divide-y divide-border rounded-md border border-border">
          {data.readFields.map((f) => (
            <div key={f.id} className="grid grid-cols-3 gap-3 px-4 py-3">
              <dt className="text-sm font-medium text-muted-foreground">{f.label}</dt>
              <dd className="col-span-2 text-sm">
                <FieldValue field={f} value={data.entry.data[f.key]} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      {data.discussionsEnabled && (
        <Discussion token={token} inviteKey={inviteKey} recordId={data.entry.id} />
      )}
    </div>
  );
}
