"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PanelLeft, Plus } from "lucide-react";
import type { WikiTreeNode } from "@monark/wiki/contracts";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/patterns";
import { buildWikiTree, WikiTree, type WikiTreeHandlers } from "./wiki-tree";
import { MovePageDialog } from "./move-page-dialog";

const EXPANDED_KEY = "wiki-expanded";

export function WikiShell({
  initialTree,
  canCreate,
  canUpdate,
  canDelete,
  children,
}: {
  initialTree: WikiTreeNode[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("wiki");
  const router = useRouter();
  const params = useParams<{ pageId?: string }>();
  const activeId = params.pageId;
  const utils = trpc.useUtils();

  const treeQuery = trpc.wiki.pages.tree.useQuery(undefined, {
    initialData: initialTree,
    refetchOnWindowFocus: false,
  });
  const flat = treeQuery.data ?? [];
  const tree = useMemo(() => buildWikiTree(flat), [flat]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState<WikiTreeNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WikiTreeNode | null>(null);

  // Load persisted expand state after mount (client-only ; avoids SSR mismatch).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(EXPANDED_KEY);
      if (raw) setExpanded(new Set(JSON.parse(raw) as string[]));
    } catch {
      // ignore unavailable / corrupt storage
    }
  }, []);

  const persistExpanded = (next: Set<string>) => {
    try {
      window.localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
    } catch {
      // ignore
    }
  };

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistExpanded(next);
      return next;
    });
  }, []);

  // Keep the active page's ancestors expanded so it's always visible in the tree.
  useEffect(() => {
    if (!activeId) return;
    const byId = new Map(flat.map((n) => [n.id, n]));
    const toOpen: string[] = [];
    let cur = byId.get(activeId)?.parentId ?? null;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      toOpen.push(cur);
      cur = byId.get(cur)?.parentId ?? null;
    }
    if (toOpen.length > 0) {
      setExpanded((prev) => {
        if (toOpen.every((id) => prev.has(id))) return prev;
        const next = new Set(prev);
        toOpen.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [activeId, flat]);

  const createMutation = trpc.wiki.pages.create.useMutation({
    onSuccess: (page) => {
      void utils.wiki.pages.tree.invalidate();
      if (page.parentId) {
        setExpanded((prev) => {
          const next = new Set(prev).add(page.parentId!);
          persistExpanded(next);
          return next;
        });
      }
      setDrawerOpen(false);
      router.push(`/wiki/${page.id}`);
    },
    onError: (e) => toast.error(e.message || t("toast.error")),
  });

  const moveMutation = trpc.wiki.pages.move.useMutation({
    onSuccess: () => {
      void utils.wiki.pages.tree.invalidate();
      setMoveTarget(null);
      toast.success(t("toast.moved"));
    },
    onError: (e) => toast.error(e.message || t("toast.error")),
  });

  const duplicateMutation = trpc.wiki.pages.duplicate.useMutation({
    onSuccess: (page) => {
      void utils.wiki.pages.tree.invalidate();
      setDrawerOpen(false);
      router.push(`/wiki/${page.id}`);
      toast.success(t("toast.duplicated"));
    },
    onError: (e) => toast.error(e.message || t("toast.error")),
  });

  const deleteMutation = trpc.wiki.pages.delete.useMutation({
    onSuccess: (res) => {
      void utils.wiki.pages.tree.invalidate();
      setDeleteTarget(null);
      toast.success(t("toast.deleted"));
      // If the open page (or one of its ancestors) was removed, leave it.
      if (activeId && res.pageIds.includes(activeId)) router.push("/wiki");
    },
    onError: (e) => toast.error(e.message || t("toast.error")),
  });

  const handlers: WikiTreeHandlers = {
    activeId,
    expanded,
    onToggleExpand: toggleExpand,
    canCreate,
    canUpdate,
    canDelete,
    onAddChild: (parentId) => createMutation.mutate({ parentId, title: t("untitled") }),
    onMove: (node) => setMoveTarget(node),
    onDuplicate: (id) => duplicateMutation.mutate({ id }),
    onDelete: (node) => setDeleteTarget(node),
    onNavigate: () => setDrawerOpen(false),
  };

  const treePanel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">{t("title")}</span>
        {canCreate && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => createMutation.mutate({ parentId: null, title: t("untitled") })}
            disabled={createMutation.isPending}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            {t("newPage")}
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tree.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">{t("tree.empty")}</p>
        ) : (
          <WikiTree nodes={tree} handlers={handlers} />
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="hidden w-72 shrink-0 border-r border-border md:block">{treePanel}</aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:hidden">
          <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)}>
            <PanelLeft className="mr-1 h-4 w-4" aria-hidden />
            {t("tree.pagesLabel")}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-80 p-0">
          <SheetTitle className="sr-only">{t("tree.pagesLabel")}</SheetTitle>
          {treePanel}
        </SheetContent>
      </Sheet>

      <MovePageDialog
        page={moveTarget}
        flat={flat}
        isPending={moveMutation.isPending}
        onConfirm={(newParentId) =>
          moveTarget && moveMutation.mutate({ id: moveTarget.id, newParentId, beforeId: null })
        }
        onClose={() => setMoveTarget(null)}
      />

      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t("delete.title")}
        description={t("delete.description", { title: deleteTarget?.title ?? "" })}
        cancelLabel={t("delete.cancel")}
        confirmLabel={t("delete.confirm")}
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
      />
    </div>
  );
}
