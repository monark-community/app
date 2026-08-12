"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import type { Block } from "@blocknote/core";
import { WIKI_ICON_MAX } from "@monark/wiki/contracts";
import { trpc } from "@/lib/trpc";
import { useDebounced } from "@/components/fields";
import { BlockEditor } from "@/components/fields/inputs/block-editor";
import { Skeleton } from "@/components/ui/skeleton";

function asBlocks(value: unknown): Block[] {
  return Array.isArray(value) ? (value as Block[]) : [];
}

/**
 * A single wiki page : breadcrumb, an emoji + title header, and the block-editor
 * body. Title / icon / content autosave (debounced) via `wiki.pages.update` ;
 * the sidebar tree is invalidated on save so a rename shows up there. Read-only
 * for a caller without `wiki.update`.
 */
export function WikiPageView({ pageId }: { pageId: string }) {
  const t = useTranslations("wiki");
  const utils = trpc.useUtils();

  const perms = trpc.rbac.myPermissions.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });
  const canUpdate = (perms.data ?? []).includes("wiki.update");

  const query = trpc.wiki.pages.get.useQuery({ id: pageId }, { refetchOnWindowFocus: false });
  const page = query.data?.page;
  const ancestors = query.data?.ancestors ?? [];

  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  // The body is UNCONTROLLED : `initialBlocks` seeds the create-once editor at
  // mount ; live edits stream into `blocksRef` and autosave on a timer, so the
  // editor's React tree never re-renders while typing. That's essential on
  // mobile — a re-render mid-IME-composition swallows the composition, which is
  // why Enter did nothing even though plain characters typed fine.
  const [initialBlocks, setInitialBlocks] = useState<Block[]>([]);
  const blocksRef = useRef<Block[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved = useRef<{ title: string; icon: string | null; content: string }>({
    title: "",
    icon: null,
    content: "[]",
  });

  // Seed local state the first time each page's data lands. Done during render
  // (the "reset state when a prop changes" pattern) so the create-once BlockEditor
  // — keyed on `page.id` below — mounts with the right content on the first frame.
  // A background refetch of the *same* page doesn't re-seed (guarded by `seededFor`).
  const seededFor = useRef<string | null>(null);
  if (page && seededFor.current !== page.id) {
    seededFor.current = page.id;
    const blocks = asBlocks(page.content);
    setTitle(page.title);
    setIcon(page.icon);
    setInitialBlocks(blocks);
    blocksRef.current = blocks;
    saved.current = { title: page.title, icon: page.icon, content: JSON.stringify(blocks) };
  }

  const debouncedTitle = useDebounced(title, 600);
  const debouncedIcon = useDebounced(icon, 400);

  const updateMutation = trpc.wiki.pages.update.useMutation({
    onSuccess: () => {
      // Refresh the sidebar (title / icon) ; leave the page query alone so it
      // doesn't fight the editor.
      void utils.wiki.pages.tree.invalidate();
    },
    onError: (e) => toast.error(e.message || t("toast.error")),
  });

  // Title / icon are low-frequency inputs, so a debounced-value effect is fine.
  useEffect(() => {
    if (!page || !canUpdate) return;
    const patch: { title?: string; icon?: string | null } = {};
    const nextTitle = debouncedTitle.trim() === "" ? t("untitled") : debouncedTitle;
    if (nextTitle !== saved.current.title) patch.title = nextTitle;
    if ((debouncedIcon ?? null) !== saved.current.icon) patch.icon = debouncedIcon ?? null;
    if (Object.keys(patch).length === 0) return;
    saved.current = {
      ...saved.current,
      title: patch.title ?? saved.current.title,
      icon: patch.icon !== undefined ? patch.icon : saved.current.icon,
    };
    updateMutation.mutate({ id: page.id, ...patch });
    // Narrow deps on purpose : only a settled title/icon edit triggers a save.
  }, [debouncedTitle, debouncedIcon]);

  // Body edits : write to a ref and save on a trailing 800ms timer. No setState,
  // so the editor is never re-rendered by its own typing.
  const saveBody = useCallback(
    (blocks: Block[]) => {
      blocksRef.current = blocks;
      if (!canUpdate) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const json = JSON.stringify(blocks);
        if (json === saved.current.content) return;
        saved.current = { ...saved.current, content: json };
        updateMutation.mutate({ id: pageId, content: blocks });
      }, 800);
    },
    [canUpdate, pageId, updateMutation],
  );

  // Flush a pending body save when leaving the page (navigating to another page
  // or unmounting), so the last <800ms of edits aren't lost. `flushRef` always
  // holds the latest closure ; the cleanup calls it once on unmount.
  const flushRef = useRef<() => void>(() => {});
  flushRef.current = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!canUpdate) return;
    const json = JSON.stringify(blocksRef.current);
    if (json === saved.current.content) return;
    saved.current = { ...saved.current, content: json };
    updateMutation.mutate({ id: pageId, content: blocksRef.current });
  };
  useEffect(() => () => flushRef.current(), []);

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 md:px-8">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!page) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-muted-foreground md:px-8">
        {t("page.notFound")}
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-4 py-6 md:px-8">
      {ancestors.length > 0 && (
        <nav
          aria-label={t("page.breadcrumb")}
          className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
        >
          {ancestors.map((a) => (
            <span key={a.id} className="flex items-center gap-1">
              <Link
                href={`/wiki/${a.id}`}
                className="truncate hover:text-foreground hover:underline"
              >
                {a.icon ? `${a.icon} ` : ""}
                {a.title}
              </Link>
              <ChevronRight className="h-3 w-3" aria-hidden />
            </span>
          ))}
        </nav>
      )}

      <div className="flex items-start gap-2">
        <input
          value={icon ?? ""}
          onChange={(e) => setIcon(e.target.value || null)}
          maxLength={WIKI_ICON_MAX}
          disabled={!canUpdate}
          aria-label={t("page.iconLabel")}
          placeholder="＋"
          className="h-11 w-11 shrink-0 rounded-md text-center text-3xl leading-none outline-none placeholder:text-lg placeholder:text-muted-foreground/40 hover:bg-muted/50 focus:bg-muted/50 disabled:hover:bg-transparent"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!canUpdate}
          aria-label={t("page.titleLabel")}
          placeholder={t("untitled")}
          className="min-w-0 flex-1 bg-transparent pt-1 text-3xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40"
        />
      </div>

      <div className="mt-4 min-h-0 flex-1">
        <BlockEditor
          key={page.id}
          value={initialBlocks}
          onChange={saveBody}
          editable={canUpdate}
          placeholder={t("page.contentPlaceholder")}
          fill
          ariaLabel={t("page.contentLabel")}
        />
      </div>
    </div>
  );
}
