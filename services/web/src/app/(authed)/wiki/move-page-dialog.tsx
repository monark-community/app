"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, FileText, Home } from "lucide-react";
import type { WikiTreeNode } from "@monark/wiki/contracts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildWikiTree, type WikiTreeItem } from "./wiki-tree";

function descendantIds(flat: WikiTreeNode[], rootId: string): Set<string> {
  const childrenOf = new Map<string | null, string[]>();
  for (const n of flat) {
    const arr = childrenOf.get(n.parentId) ?? [];
    arr.push(n.id);
    childrenOf.set(n.parentId, arr);
  }
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const c of childrenOf.get(id) ?? []) {
      if (!out.has(c)) {
        out.add(c);
        stack.push(c);
      }
    }
  }
  return out;
}

/** Choose a new parent for a page. Its own subtree is excluded (a page can't be
 *  moved under itself or a descendant). "Top level" moves it to a root page. */
export function MovePageDialog({
  page,
  flat,
  isPending,
  onConfirm,
  onClose,
}: {
  page: WikiTreeNode | null;
  flat: WikiTreeNode[];
  isPending: boolean;
  onConfirm: (newParentId: string | null) => void;
  onClose: () => void;
}) {
  const t = useTranslations("wiki");
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (page) setTarget(page.parentId);
  }, [page]);

  const options = useMemo(() => {
    if (!page) return [];
    const blocked = descendantIds(flat, page.id);
    blocked.add(page.id);
    const out: { id: string; title: string; icon: string | null; depth: number }[] = [];
    const walk = (nodes: WikiTreeItem[], depth: number) => {
      for (const n of nodes) {
        if (blocked.has(n.id)) continue; // skip the page + its whole subtree
        out.push({ id: n.id, title: n.title, icon: n.icon, depth });
        walk(n.children, depth + 1);
      }
    };
    walk(buildWikiTree(flat), 0);
    return out;
  }, [page, flat]);

  return (
    <Dialog open={page != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("move.title")}</DialogTitle>
          <DialogDescription>
            {t("move.description", { title: page?.title ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto rounded-md border border-border p-1">
          <TargetRow
            selected={target === null}
            depth={0}
            icon={<Home className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
            label={t("move.root")}
            onSelect={() => setTarget(null)}
          />
          {options.map((o) => (
            <TargetRow
              key={o.id}
              selected={target === o.id}
              depth={o.depth + 1}
              icon={
                o.icon ? (
                  <span aria-hidden>{o.icon}</span>
                ) : (
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                )
              }
              label={o.title}
              onSelect={() => setTarget(o.id)}
            />
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            {t("move.cancel")}
          </Button>
          <Button onClick={() => onConfirm(target)} disabled={isPending}>
            {t("move.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TargetRow({
  selected,
  depth,
  icon,
  label,
  onSelect,
}: {
  selected: boolean;
  depth: number;
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted/60",
        selected && "bg-muted font-medium",
      )}
      style={{ paddingLeft: `${depth * 14 + 8}px` }}
    >
      <span className="w-4 shrink-0 text-center leading-none">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
    </button>
  );
}
