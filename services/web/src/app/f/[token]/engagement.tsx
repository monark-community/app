"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronUp, EyeOff, Eye, Loader2, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format-time";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

// Engagement is never anonymous : a logged-in user, or a board invite (for
// voting only). Login state comes from `users.me` (a public procedure that
// returns null when logged out ; the client attaches the session token).
export function useEngageIdentity(inviteKey: string | null) {
  const meQuery = trpc.users.me.useQuery(undefined, {
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const me = meQuery.data ?? null;
  const isLoggedIn = me != null;
  return {
    me,
    isLoggedIn,
    canEngage: isLoggedIn || inviteKey != null,
    isLoading: meQuery.isLoading,
  };
}

export function VotePill({
  token,
  inviteKey,
  recordId,
  count,
  hasVoted,
  canEngage,
}: {
  token: string;
  inviteKey: string | null;
  recordId: string;
  count: number;
  hasVoted: boolean;
  canEngage: boolean;
}) {
  const t = useTranslations("public.form.vote");
  const [state, setState] = useState({ count, voted: hasVoted });
  // Reconcile when the parent re-supplies state (board re-fetch, detail query).
  useEffect(() => setState({ count, voted: hasVoted }), [count, hasVoted]);

  const vote = trpc.dataModels.forms.public.vote.useMutation({
    onSuccess: (r) => setState({ count: r.count, voted: r.hasVoted }),
    onError: (e) => toast.error(e.message || t("error")),
  });
  const disabled = !canEngage || vote.isPending;

  return (
    <button
      type="button"
      aria-pressed={state.voted}
      aria-label={t("label")}
      title={canEngage ? t("label") : t("signInHint")}
      disabled={disabled}
      onClick={(e) => {
        // The pill can sit inside a Link row (board list) — don't navigate.
        e.preventDefault();
        e.stopPropagation();
        vote.mutate({ token, key: inviteKey ?? undefined, recordId });
      }}
      className={cn(
        "inline-flex min-w-[3rem] flex-col items-center justify-center rounded-md border px-2 py-1 text-xs transition-colors",
        state.voted
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-accent",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <ChevronUp className="h-4 w-4" aria-hidden />
      <span className="font-medium tabular-nums">{state.count}</span>
    </button>
  );
}

export function Discussion({
  token,
  inviteKey,
  recordId,
}: {
  token: string;
  inviteKey: string | null;
  recordId: string;
}) {
  const t = useTranslations("public.form.discussion");
  const locale = useLocale();
  const utils = trpc.useUtils();
  const { me, isLoggedIn } = useEngageIdentity(inviteKey);

  const canModerate =
    trpc.dataModels.forms.public.canModerate.useQuery(
      { token },
      { enabled: isLoggedIn, refetchOnWindowFocus: false },
    ).data?.canModerate ?? false;

  const listArgs = { token, key: inviteKey ?? undefined, recordId, limit: 20 };
  const query = trpc.dataModels.forms.public.comments.list.useInfiniteQuery(listArgs, {
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchOnWindowFocus: false,
  });
  const comments = query.data?.pages.flatMap((p) => p.items) ?? [];
  const invalidate = () => utils.dataModels.forms.public.comments.list.invalidate(listArgs);

  const [body, setBody] = useState("");
  const post = trpc.dataModels.forms.public.comments.post.useMutation({
    onSuccess: () => {
      setBody("");
      void invalidate();
    },
    onError: (e) => toast.error(e.message || t("error")),
  });
  const remove = trpc.dataModels.forms.public.comments.remove.useMutation({
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(e.message || t("error")),
  });
  const setHidden = trpc.dataModels.forms.public.comments.setHidden.useMutation({
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(e.message || t("error")),
  });

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold">
        {t("title")}
        {comments.length > 0 && (
          <span className="ml-1.5 text-muted-foreground">({comments.length})</span>
        )}
      </h2>

      {query.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : comments.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-4">
          {comments.map((c) => {
            const canDelete = me?.id === c.authorId || canModerate;
            return (
              <li key={c.id} className={cn("flex gap-3", c.hidden && "opacity-60")}>
                <Avatar className="h-8 w-8 shrink-0">
                  {c.authorAvatarUrl && <AvatarImage src={c.authorAvatarUrl} alt="" />}
                  <AvatarFallback>{(c.authorName || "?").slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {c.authorName || t("someone")}
                    </span>
                    <span>{formatRelativeTime(c.createdAt, locale)}</span>
                    {c.hidden && <span className="italic">· {t("hiddenBadge")}</span>}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.body}</p>
                  {(canDelete || canModerate) && (
                    <div className="mt-1 flex gap-3 text-xs">
                      {canModerate && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            setHidden.mutate({ token, commentId: c.id, hidden: !c.hidden })
                          }
                        >
                          {c.hidden ? (
                            <>
                              <Eye className="h-3 w-3" aria-hidden />
                              {t("unhide")}
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-3 w-3" aria-hidden />
                              {t("hide")}
                            </>
                          )}
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive"
                          onClick={() => remove.mutate({ token, commentId: c.id })}
                        >
                          <Trash2 className="h-3 w-3" aria-hidden />
                          {t("delete")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {query.hasNextPage && (
        <div className="mt-4 text-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? t("loading") : t("loadMore")}
          </Button>
        </div>
      )}

      <div className="mt-6 border-t border-border pt-4">
        {isLoggedIn ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const text = body.trim();
              if (text) post.mutate({ token, recordId, body: text });
            }}
          >
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("placeholder")}
              rows={3}
              maxLength={4000}
            />
            <div className="mt-2 flex justify-end">
              <Button type="submit" size="sm" disabled={!body.trim() || post.isPending}>
                {post.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                {t("post")}
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">{t("signInToComment")}</p>
        )}
      </div>
    </section>
  );
}
