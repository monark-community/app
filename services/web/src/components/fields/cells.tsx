import type { ReactNode } from "react";
import { Check, Link2, Mail, Minus, Paperclip } from "lucide-react";
import { blocksToText } from "@monark/common/blocks";
import { Badge } from "@/components/ui/badge";
import { rewriteForCurrentHost } from "@/lib/dev-host-rewrite";
import { cn } from "@/lib/utils";
import { FieldAvatar } from "./field-avatar";
import { htmlToText } from "./rich-text";
import type { FieldDef, FieldLabels, RelationOption, SelectOption } from "./types";

/** Chrome strings a cell needs (subset of {@link FieldLabels}). */
export type CellLabels = Pick<FieldLabels, "empty" | "yes" | "no" | "more">;

function Empty({ labels }: { labels: CellLabels }) {
  return (
    <span className="text-xs text-muted-foreground" aria-label={labels.empty}>
      —
    </span>
  );
}

function formatNumber(value: number, def: { prefix?: string; suffix?: string }) {
  return `${def.prefix ?? ""}${value.toLocaleString()}${def.suffix ?? ""}`;
}

function formatDate(value: Date, withTime: boolean): string {
  return value.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/** First N chips + a "+N" overflow, used by multiSelect / relation cells. */
function ChipsCell({
  items,
  labels,
  limit = 3,
}: {
  items: {
    key: string;
    label: string;
    tone?: SelectOption["tone"];
    avatar?: { label: string; src?: string };
  }[];
  labels: CellLabels;
  limit?: number;
}) {
  if (items.length === 0) return <Empty labels={labels} />;
  const shown = items.slice(0, limit);
  const overflow = items.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((it) => (
        <Badge
          key={it.key}
          variant={it.tone ?? "secondary"}
          size="sm"
          className={it.avatar ? "gap-1 pl-0.5" : undefined}
        >
          {it.avatar ? (
            <FieldAvatar label={it.avatar.label} src={it.avatar.src} className="h-4 w-4" />
          ) : null}
          {it.label}
        </Badge>
      ))}
      {overflow > 0 ? (
        <span className="text-xs text-muted-foreground">{labels.more(overflow)}</span>
      ) : null}
    </div>
  );
}

function toRelationList(
  value: RelationOption | RelationOption[] | null | undefined,
): RelationOption[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Renders a field value for a data-table cell. Conventions match the
 * existing hand-rolled cells (muted em-dash for empty, badges for
 * enums / relations, muted `text-xs` for dates). Relation values must
 * be passed already-resolved as {@link RelationOption}(s) — the cell
 * cannot fetch.
 */
export function renderFieldValue(def: FieldDef, value: unknown, labels: CellLabels): ReactNode {
  switch (def.type) {
    case "text": {
      const v = (value as string | null) ?? "";
      return v ? <span className="block truncate">{v}</span> : <Empty labels={labels} />;
    }

    case "longText": {
      const v = (value as string | null) ?? "";
      return v ? (
        <span className="block max-w-md truncate text-muted-foreground">{v}</span>
      ) : (
        <Empty labels={labels} />
      );
    }

    case "richText": {
      const text = htmlToText((value as string | null) ?? "");
      return text ? (
        <span className="block max-w-md truncate text-muted-foreground">{text}</span>
      ) : (
        <Empty labels={labels} />
      );
    }

    case "document": {
      const text = blocksToText(value).replace(/\n/g, " ");
      return text ? (
        <span className="block max-w-md truncate text-muted-foreground">{text}</span>
      ) : (
        <Empty labels={labels} />
      );
    }

    case "url": {
      const v = (value as string | null) ?? "";
      if (!v) return <Empty labels={labels} />;
      return (
        <a
          href={v}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 truncate text-primary hover:underline"
        >
          <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{v}</span>
        </a>
      );
    }

    case "email": {
      const v = (value as string | null) ?? "";
      if (!v) return <Empty labels={labels} />;
      return (
        <a
          href={`mailto:${v}`}
          className="inline-flex items-center gap-1 truncate text-primary hover:underline"
        >
          <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{v}</span>
        </a>
      );
    }

    case "number": {
      const v = value as number | null;
      return v == null ? (
        <Empty labels={labels} />
      ) : (
        <span className="tabular-nums">{formatNumber(v, def)}</span>
      );
    }

    case "boolean": {
      const v = Boolean(value);
      return v ? (
        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <Check className="h-4 w-4" aria-hidden />
          <span className="sr-only">{labels.yes}</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Minus className="h-4 w-4" aria-hidden />
          <span className="sr-only">{labels.no}</span>
        </span>
      );
    }

    case "date":
    case "datetime": {
      const v = value as Date | string | null;
      if (!v) return <Empty labels={labels} />;
      const date = v instanceof Date ? v : new Date(v);
      if (Number.isNaN(date.getTime())) return <Empty labels={labels} />;
      return (
        <span className="text-xs text-muted-foreground">
          {formatDate(date, def.type === "datetime")}
        </span>
      );
    }

    case "singleSelect": {
      const v = value as string | null;
      if (!v) return <Empty labels={labels} />;
      const opt = def.options.find((o) => o.value === v);
      return (
        <Badge variant={opt?.tone ?? "secondary"} size="sm">
          {opt?.label ?? v}
        </Badge>
      );
    }

    case "multiSelect": {
      const v = (value as string[] | null) ?? [];
      const byValue = new Map(def.options.map((o) => [o.value, o]));
      return (
        <ChipsCell
          labels={labels}
          items={v.map((val) => ({
            key: val,
            label: byValue.get(val)?.label ?? val,
            tone: byValue.get(val)?.tone,
          }))}
        />
      );
    }

    case "relation": {
      const list = toRelationList(value as RelationOption | RelationOption[] | null);
      return (
        <ChipsCell
          labels={labels}
          items={list.map((o) => ({
            key: o.id,
            label: o.label,
            // Host-rewritten so a relation avatar still resolves when the
            // app is opened from another device on the LAN ; the stored
            // URL is absolute against the (loopback, in dev) storage
            // origin. No-op in production. See lib/dev-host-rewrite.ts.
            avatar: def.avatars
              ? {
                  label: o.label,
                  src: o.avatarUrl ? rewriteForCurrentHost(o.avatarUrl) : o.avatarUrl,
                }
              : undefined,
          }))}
        />
      );
    }

    case "file": {
      // The cell can't fetch file metadata per row (like relation cells, it
      // receives raw ids), so it shows a paperclip + count rather than names.
      const ids = Array.isArray(value) ? (value as string[]) : value ? [value as string] : [];
      if (ids.length === 0) return <span className="text-muted-foreground">{labels.empty}</span>;
      return (
        <Badge variant="outline" className="gap-1 font-normal">
          <Paperclip className="h-3 w-3" aria-hidden />
          {ids.length}
        </Badge>
      );
    }

    case "formula": {
      // A computed value renders by its declared result type. DATE round-trips
      // through JSONB as an ISO string, so accept either a Date or a string.
      if (value == null || value === "") return <Empty labels={labels} />;
      switch (def.resultType) {
        case "number": {
          const n = typeof value === "number" ? value : Number(value);
          return Number.isFinite(n) ? (
            <span className="tabular-nums">{n.toLocaleString()}</span>
          ) : (
            <Empty labels={labels} />
          );
        }
        case "boolean":
          return Boolean(value) ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Check className="h-4 w-4" aria-hidden />
              <span className="sr-only">{labels.yes}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Minus className="h-4 w-4" aria-hidden />
              <span className="sr-only">{labels.no}</span>
            </span>
          );
        case "date": {
          const date = value instanceof Date ? value : new Date(value as string);
          return Number.isNaN(date.getTime()) ? (
            <Empty labels={labels} />
          ) : (
            <span className="text-xs text-muted-foreground">{formatDate(date, false)}</span>
          );
        }
        default:
          return <span className="block truncate">{String(value)}</span>;
      }
    }
  }
}

/** Thin component wrapper around {@link renderFieldValue}. */
export function FieldCell({
  def,
  value,
  labels,
  className,
}: {
  def: FieldDef;
  value: unknown;
  labels: CellLabels;
  className?: string;
}) {
  return <div className={cn(className)}>{renderFieldValue(def, value, labels)}</div>;
}
