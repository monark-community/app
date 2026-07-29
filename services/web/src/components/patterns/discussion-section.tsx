"use client";

import { useTranslations } from "next-intl";
import { User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface DiscussionComment {
  id: string;
  authorName: string;
  /** Fallback initials shown in the avatar when there's no image. */
  authorInitials: string;
  /** Already-formatted relative time ("2 days ago"). */
  timeLabel: string;
  body: string;
}

export interface DiscussionLabels {
  composerPlaceholder: string;
  submit: string;
  /** Shown when there are no comments. */
  empty: string;
  /** Optional hint that the feature is a preview (posting disabled). */
  note?: string;
}

/**
 * The "Discussion" section body : a comment composer over a flat, thread-less
 * list of comments. Presentational + text-free — pass already-translated
 * `labels` and `comments`. Today it's wired to a static preview (see
 * {@link useDiscussionPreview}) with `disabled` keeping the composer inert ;
 * swap `comments` for real data and drop `disabled` when the feature lands.
 */
export function DiscussionSection({
  comments,
  labels,
  disabled = false,
}: {
  comments: DiscussionComment[];
  labels: DiscussionLabels;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback>
            <User className="h-4 w-4 text-muted-foreground" aria-hidden />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-2">
          <Textarea
            placeholder={labels.composerPlaceholder}
            disabled={disabled}
            rows={2}
            className="resize-none"
          />
          <div className="flex items-center justify-between gap-3">
            {labels.note ? (
              <p className="text-xs text-muted-foreground">{labels.note}</p>
            ) : (
              <span />
            )}
            <Button type="button" size="sm" disabled={disabled} className="shrink-0">
              {labels.submit}
            </Button>
          </div>
        </div>
      </div>

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <ul className="space-y-4">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs font-medium">{c.authorInitials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-medium text-foreground">{c.authorName}</span>
                  <span className="text-xs text-muted-foreground">{c.timeLabel}</span>
                </div>
                <p className="whitespace-pre-line text-sm text-muted-foreground">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Static preview wiring for {@link DiscussionSection} while the real comments
 * feature is unbuilt : two sample comments + a disabled composer, all pulled
 * from the shared `dataForm.discussion` catalog. Replace with the real query
 * later ; the presentational component stays the same.
 */
export function useDiscussionPreview(): {
  comments: DiscussionComment[];
  labels: DiscussionLabels;
  disabled: boolean;
} {
  const t = useTranslations("dataForm.discussion");
  return {
    disabled: true,
    labels: {
      composerPlaceholder: t("composerPlaceholder"),
      submit: t("submit"),
      empty: t("empty"),
      note: t("note"),
    },
    comments: [
      {
        id: "sample-1",
        authorName: t("sample1Author"),
        authorInitials: t("sample1Initials"),
        timeLabel: t("sample1Time"),
        body: t("sample1Body"),
      },
      {
        id: "sample-2",
        authorName: t("sample2Author"),
        authorInitials: t("sample2Initials"),
        timeLabel: t("sample2Time"),
        body: t("sample2Body"),
      },
    ],
  };
}
