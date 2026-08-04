"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Bookmark, ChevronDown, Globe, Lock, Plus, Trash2 } from "lucide-react";
import { fieldKindsFrom, printQuery, type FilterNode } from "@monark/query/contracts";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import type { QueryFieldMeta } from "@/components/query/query-bar";

export type KanbanViewsMenuLabels = {
  trigger: string;
  heading: string;
  empty: string;
  save: string;
  dialogTitle: string;
  namePlaceholder: string;
  shareLabel: string;
  saveCta: string;
  cancel: string;
  deleteTitle: string;
  deleteConfirm: string;
  deleteDescription: string;
  saved: string;
  deleted: string;
  loaded: string;
};

/**
 * Saved-view picker for the kanban board query bar : load a saved MonarkQL
 * query, save the current one (personal or shared), delete your own. The board
 * is the scope (its columns/members are the query fields). Parity with the
 * data-models records view menu, wired to `kanban.views.*`.
 */
export function ViewsMenu({
  boardId,
  fields,
  currentQuery,
  onPick,
  labels,
}: {
  boardId: string;
  fields: QueryFieldMeta[];
  currentQuery: FilterNode | null;
  onPick: (text: string) => void;
  labels: KanbanViewsMenuLabels;
}) {
  const utils = trpc.useUtils();
  const viewsQuery = trpc.kanban.views.list.useQuery({ boardId });
  const views = viewsQuery.data ?? [];

  const kinds = useMemo(
    () => fieldKindsFrom(fields.map((f) => ({ key: f.key, kind: f.kind }))),
    [fields],
  );

  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  const invalidate = () => utils.kanban.views.list.invalidate({ boardId });

  const createMutation = trpc.kanban.views.create.useMutation({
    onSuccess: () => {
      toast.success(labels.saved);
      setSaveOpen(false);
      setName("");
      setShared(false);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.kanban.views.delete.useMutation({
    onSuccess: () => {
      toast.success(labels.deleted);
      setToDelete(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function loadView(query: FilterNode) {
    onPick(printQuery(query, kinds));
    toast.success(labels.loaded);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Default size (h-9) to match the board selector + search bar height. */}
          <Button variant="outline" className="gap-1.5">
            <Bookmark className="h-4 w-4" aria-hidden />
            {labels.trigger}
            {views.length > 0 && <span className="text-muted-foreground">({views.length})</span>}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>{labels.heading}</DropdownMenuLabel>
          {views.length === 0 ? (
            <DropdownMenuItem disabled>{labels.empty}</DropdownMenuItem>
          ) : (
            views.map((v) => (
              <DropdownMenuItem
                key={v.id}
                onSelect={() => loadView(v.query)}
                className="flex items-center gap-2"
              >
                {v.shared ? (
                  <Globe className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                ) : (
                  <Lock className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                )}
                <span className="flex-1 truncate">{v.name}</span>
                {v.mine && (
                  <button
                    type="button"
                    aria-label={labels.deleteConfirm}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setToDelete({ id: v.id, name: v.name });
                    }}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!currentQuery} onSelect={() => setSaveOpen(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            {labels.save}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{labels.dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={labels.namePlaceholder}
              maxLength={80}
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={shared} onChange={(e) => setShared(e.target.checked)} />
              {labels.shareLabel}
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              {labels.cancel}
            </Button>
            <Button
              disabled={!name.trim() || !currentQuery || createMutation.isPending}
              onClick={() => {
                if (!currentQuery) return;
                createMutation.mutate({ boardId, name: name.trim(), query: currentQuery, shared });
              }}
            >
              {labels.saveCta}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={labels.deleteTitle}
        description={labels.deleteDescription.replace("{name}", toDelete?.name ?? "")}
        cancelLabel={labels.cancel}
        confirmLabel={labels.deleteConfirm}
        isPending={deleteMutation.isPending}
        onConfirm={() => toDelete && deleteMutation.mutate({ id: toDelete.id })}
      />
    </>
  );
}
