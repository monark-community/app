"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, ChevronLeft, Lock, MessageSquare, Plus, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { VotePill, useEngageIdentity } from "./engagement";
import {
  AutoForm,
  dataFieldToFieldDef,
  useDebounced,
  type DataFieldForAdapter,
} from "@/components/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export interface PublicField {
  id: string;
  key: string;
  label: string;
  description: string | null;
  type: DataFieldForAdapter["type"];
  config: unknown;
  required: boolean;
}

interface PublicFormData {
  name: string;
  intro: string | null;
  successMessage: string | null;
  mode: "ANONYMOUS" | "EMAIL";
  modelName: string;
  state: "open" | "closed" | "submitted" | "invalid";
  prefillEmail: string | null;
  fields: PublicField[];
  listEnabled: boolean;
  canRead: boolean;
  readFields: PublicField[];
  votingEnabled: boolean;
  discussionsEnabled: boolean;
}

export function PublicForm({
  token,
  inviteKey,
  initial,
}: {
  token: string;
  inviteKey: string | null;
  initial: PublicFormData;
}) {
  const t = useTranslations("public.form");
  const [done, setDone] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const board = initial.listEnabled && initial.canRead;
  const canSubmit = initial.state === "open";
  const [view, setView] = useState<"board" | "new">(board ? "board" : "new");

  const submit = trpc.dataModels.forms.public.submit.useMutation({
    onSuccess: () => setDone(true),
    onError: (e) => toast.error(e.message || t("error")),
  });
  const fieldDefs = initial.fields.map((f) => dataFieldToFieldDef(f as DataFieldForAdapter));

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{initial.name}</h1>
        <p className="text-sm text-muted-foreground">{initial.modelName}</p>
      </div>

      {done ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden />
          <h2 className="text-lg font-semibold">{t("done.title")}</h2>
          <p className="max-w-sm whitespace-pre-line text-sm text-muted-foreground">
            {initial.successMessage || t("done.body")}
          </p>
          {board && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDone(false);
                setView("board");
              }}
            >
              {t("backToBoard")}
            </Button>
          )}
        </div>
      ) : board && view === "board" ? (
        <Board
          token={token}
          inviteKey={inviteKey}
          readFields={initial.readFields}
          canSubmit={canSubmit}
          votingEnabled={initial.votingEnabled}
          discussionsEnabled={initial.discussionsEnabled}
          onNew={() => setView("new")}
        />
      ) : view === "new" && canSubmit ? (
        <>
          {board && (
            <Button
              variant="ghost"
              size="sm"
              className="mb-2 -ml-2"
              onClick={() => setView("board")}
            >
              <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
              {t("backToBoard")}
            </Button>
          )}
          {initial.intro && (
            <p className="mb-6 whitespace-pre-line text-sm text-muted-foreground">
              {initial.intro}
            </p>
          )}
          {initial.mode === "EMAIL" && initial.prefillEmail && (
            <p className="mb-4 text-xs text-muted-foreground">
              {t("submittingAs", { email: initial.prefillEmail })}
            </p>
          )}
          <AutoForm
            key={resetKey}
            fields={fieldDefs}
            onSubmit={async (values) => {
              await submit.mutateAsync({ token, key: inviteKey ?? undefined, data: values });
            }}
            onCancel={() => setResetKey((k) => k + 1)}
            submitLabel={t("submit")}
            cancelLabel={t("clear")}
            isBusy={submit.isPending}
          />
        </>
      ) : (
        <Notice
          icon={<Lock className="h-10 w-10 text-muted-foreground" aria-hidden />}
          title={initial.state === "closed" ? t("closed.title") : t("invalid.title")}
          body={initial.state === "closed" ? t("closed.body") : t("invalid.body")}
        />
      )}
    </div>
  );
}

function Board({
  token,
  inviteKey,
  readFields,
  canSubmit,
  votingEnabled,
  discussionsEnabled,
  onNew,
}: {
  token: string;
  inviteKey: string | null;
  readFields: PublicField[];
  canSubmit: boolean;
  votingEnabled: boolean;
  discussionsEnabled: boolean;
  onNew: () => void;
}) {
  const t = useTranslations("public.form");
  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounced(rawSearch.trim(), 250);
  const [sort, setSort] = useState<"recent" | "top">("recent");
  const { canEngage } = useEngageIdentity(inviteKey);

  const query = trpc.dataModels.forms.public.list.useInfiniteQuery(
    { token, key: inviteKey ?? undefined, search: search || undefined, sort, limit: 25 },
    {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      refetchOnWindowFocus: false,
    },
  );
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const detailHref = (id: string) => `/f/${token}/e/${id}${inviteKey ? `?k=${inviteKey}` : ""}`;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            placeholder={t("board.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        {canSubmit && (
          <Button size="sm" onClick={onNew}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            {t("board.new")}
          </Button>
        )}
      </div>

      {votingEnabled && (
        <div className="mb-3 inline-flex rounded-md border border-border p-0.5 text-xs">
          {(["recent", "top"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className={
                sort === s
                  ? "rounded px-2.5 py-1 font-medium bg-accent text-foreground"
                  : "rounded px-2.5 py-1 text-muted-foreground hover:text-foreground"
              }
            >
              {t(`board.sort.${s}`)}
            </button>
          ))}
        </div>
      )}

      {query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {search ? t("board.noResults") : t("board.empty")}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 px-4 py-3 hover:bg-accent">
              {votingEnabled && (
                <VotePill
                  token={token}
                  inviteKey={inviteKey}
                  recordId={it.id}
                  count={it.voteCount}
                  hasVoted={it.hasVoted}
                  canEngage={canEngage}
                />
              )}
              <Link href={detailHref(it.id)} className="min-w-0 flex-1">
                <p className="truncate font-medium">{it.title || "—"}</p>
                {readFields.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {readFields.slice(0, 3).map((f) => (
                      <span key={f.id} className="truncate">
                        <span className="font-medium">{f.label}:</span>{" "}
                        <FieldValue field={f} value={(it.data as Record<string, unknown>)[f.key]} />
                      </span>
                    ))}
                  </div>
                )}
              </Link>
              {discussionsEnabled && it.commentCount > 0 && (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                  {it.commentCount}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {query.hasNextPage && (
        <div className="mt-4 text-center">
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? t("board.loading") : t("board.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function FieldValue({ field, value }: { field: PublicField; value: unknown }) {
  const t = useTranslations("public.form");
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const opts = ((field.config as { options?: { value: string; label: string }[] } | null)
    ?.options ?? []) as { value: string; label: string }[];
  switch (field.type) {
    case "BOOLEAN":
      return <>{value ? t("yes") : t("no")}</>;
    case "DATE":
    case "DATETIME": {
      const d = new Date(String(value));
      return <>{isNaN(d.getTime()) ? String(value) : d.toLocaleDateString()}</>;
    }
    case "SELECT":
      return <>{opts.find((o) => o.value === value)?.label ?? String(value)}</>;
    case "MULTI_SELECT":
      return (
        <>
          {(value as string[]).map((v) => opts.find((o) => o.value === v)?.label ?? v).join(", ")}
        </>
      );
    case "RICH_TEXT":
      // Public-submitted HTML — strip tags to plain text to avoid XSS.
      return (
        <>
          {String(value)
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim()}
        </>
      );
    case "URL":
      return (
        <a
          href={String(value)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-primary underline"
        >
          {String(value)}
        </a>
      );
    default:
      return <>{String(value)}</>;
  }
}

function Notice({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      {icon}
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-sm whitespace-pre-line text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
