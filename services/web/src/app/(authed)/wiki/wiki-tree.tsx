"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ChevronRight,
  CopyPlus,
  FileText,
  FolderInput,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import type { WikiTreeNode } from "@monark/wiki/contracts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** A page node with its children resolved (built from the flat tree). */
export type WikiTreeItem = WikiTreeNode & { children: WikiTreeItem[] };

/** Build the ordered nested tree from the flat, org-scoped page list. */
export function buildWikiTree(flat: WikiTreeNode[]): WikiTreeItem[] {
  const byId = new Map<string, WikiTreeItem>();
  for (const n of flat) byId.set(n.id, { ...n, children: [] });
  const roots: WikiTreeItem[] = [];
  for (const n of flat) {
    const node = byId.get(n.id)!;
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (nodes: WikiTreeItem[]) => {
    nodes.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    for (const c of nodes) sort(c.children);
  };
  sort(roots);
  return roots;
}

export type WikiTreeHandlers = {
  activeId: string | undefined;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onAddChild: (parentId: string) => void;
  onMove: (node: WikiTreeNode) => void;
  onDuplicate: (id: string) => void;
  onDelete: (node: WikiTreeNode) => void;
  /** Called on a page link click (lets the shell close the mobile drawer). */
  onNavigate?: () => void;
};

export function WikiTree({
  nodes,
  depth = 0,
  handlers,
}: {
  nodes: WikiTreeItem[];
  depth?: number;
  handlers: WikiTreeHandlers;
}) {
  return (
    <ul className={cn(depth === 0 && "space-y-0.5")}>
      {nodes.map((node) => (
        <WikiTreeRow key={node.id} node={node} depth={depth} handlers={handlers} />
      ))}
    </ul>
  );
}

function WikiTreeRow({
  node,
  depth,
  handlers,
}: {
  node: WikiTreeItem;
  depth: number;
  handlers: WikiTreeHandlers;
}) {
  const t = useTranslations("wiki");
  const hasChildren = node.children.length > 0;
  const isExpanded = handlers.expanded.has(node.id);
  const isActive = handlers.activeId === node.id;
  const canAct = handlers.canUpdate || handlers.canDelete || handlers.canCreate;

  return (
    <li>
      <div
        className={cn(
          "group/row flex items-center gap-0.5 rounded-md pr-1 text-sm transition-colors hover:bg-muted/50",
          isActive && "bg-muted font-medium",
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {/* Expand toggle occupies a fixed slot so titles align whether or not a
            page has children. */}
        {hasChildren ? (
          <button
            type="button"
            aria-label={isExpanded ? t("tree.collapse") : t("tree.expand")}
            onClick={() => handlers.onToggleExpand(node.id)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground pointer-coarse:min-h-9 pointer-coarse:min-w-9"
          >
            <ChevronRight
              className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-90")}
              aria-hidden
            />
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" aria-hidden />
        )}

        <Link
          href={`/wiki/${node.id}`}
          onClick={() => handlers.onNavigate?.()}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 focus:outline-none focus-visible:underline"
        >
          <span className="w-4 shrink-0 text-center text-sm leading-none" aria-hidden>
            {node.icon ? (
              node.icon
            ) : (
              <FileText className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate">{node.title}</span>
        </Link>

        {handlers.canCreate && (
          <button
            type="button"
            aria-label={t("tree.addChild")}
            title={t("tree.addChild")}
            onClick={() => handlers.onAddChild(node.id)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 pointer-coarse:min-h-9 pointer-coarse:min-w-9 pointer-coarse:opacity-100"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}

        {canAct && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("tree.actions")}
                className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-100 [&_svg]:size-3.5"
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {handlers.canCreate && (
                <DropdownMenuItem onSelect={() => handlers.onAddChild(node.id)}>
                  <Plus className="mr-2 h-4 w-4" aria-hidden />
                  {t("tree.addChild")}
                </DropdownMenuItem>
              )}
              {handlers.canUpdate && (
                <DropdownMenuItem onSelect={() => handlers.onMove(node)}>
                  <FolderInput className="mr-2 h-4 w-4" aria-hidden />
                  {t("tree.moveTo")}
                </DropdownMenuItem>
              )}
              {handlers.canCreate && (
                <DropdownMenuItem onSelect={() => handlers.onDuplicate(node.id)}>
                  <CopyPlus className="mr-2 h-4 w-4" aria-hidden />
                  {t("tree.duplicate")}
                </DropdownMenuItem>
              )}
              {handlers.canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => handlers.onDelete(node)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                    {t("tree.delete")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {hasChildren && isExpanded && (
        <WikiTree nodes={node.children} depth={depth + 1} handlers={handlers} />
      )}
    </li>
  );
}
