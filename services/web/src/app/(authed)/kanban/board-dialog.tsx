"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { BoardDef } from "@monark/kanban/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorInput } from "@/components/ui/color-input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/patterns";
import { trpc } from "@/lib/trpc";

export function BoardDialog({
  mode,
  board,
  initialRoleIds,
  canManage,
  canDelete,
  onClose,
  onCreated,
  onSaved,
  onDeleted,
}: {
  mode: "create" | "edit";
  board: BoardDef | null;
  /** The board's current role-access ids (edit mode) ; empty = visible to all. */
  initialRoleIds?: string[];
  canManage: boolean;
  canDelete: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("kanban");
  const isEdit = mode === "edit";

  const [name, setName] = useState(isEdit ? (board?.name ?? "") : "");
  const [description, setDescription] = useState(isEdit ? (board?.description ?? "") : "");
  const [color, setColor] = useState(isEdit ? (board?.color ?? "") : "");
  const [roleIds, setRoleIds] = useState<string[]>(initialRoleIds ?? []);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Roles the operator can grant board access to (their own roles ; mirrors the
  // calendar manage dialog). Only managers see + set role access.
  const rolesQuery = trpc.rbac.myRoles.useQuery(undefined, {
    enabled: canManage,
    refetchOnWindowFocus: false,
  });
  const roles = (rolesQuery.data ?? []).map((r) => ({ id: r.id, name: r.name }));
  function toggleRole(id: string) {
    setRoleIds((ids) => (ids.includes(id) ? ids.filter((r) => r !== id) : [...ids, id]));
  }

  const createMutation = trpc.kanban.boards.create.useMutation({
    onSuccess: (created) => {
      toast.success(t("boardDialog.createdToast"));
      if (created) onCreated(created.id);
    },
    onError: (err) => toast.error(t("boardDialog.errorToast", { message: err.message })),
  });
  const updateMutation = trpc.kanban.boards.update.useMutation({
    onSuccess: () => {
      toast.success(t("boardDialog.savedToast"));
      onSaved();
    },
    onError: (err) => toast.error(t("boardDialog.errorToast", { message: err.message })),
  });
  const deleteMutation = trpc.kanban.boards.delete.useMutation({
    onSuccess: () => {
      toast.success(t("boardDialog.deletedToast"));
      onDeleted();
    },
    onError: (err) => toast.error(t("boardDialog.errorToast", { message: err.message })),
  });

  const isBusy = createMutation.isPending || updateMutation.isPending;

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("boardDialog.nameRequired"));
      return;
    }
    const payload = {
      name: trimmed,
      description: description.trim().length > 0 ? description : null,
      color: color.trim().length > 0 ? color : null,
      // Only a manager's role selection is sent ; the server also gates this.
      ...(canManage ? { roleIds } : {}),
    };
    if (isEdit && board) {
      updateMutation.mutate({ id: board.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? t("boardDialog.editTitle") : t("boardDialog.createTitle")}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="board-name">{t("boardDialog.nameLabel")}</Label>
              <Input
                id="board-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="board-description">{t("boardDialog.descriptionLabel")}</Label>
              <Textarea
                id="board-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("boardDialog.colorLabel")}</Label>
              <ColorInput
                value={color}
                onChange={setColor}
                aria-label={t("boardDialog.colorLabel")}
              />
            </div>
            {canManage && roles.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("boardDialog.rolesLabel")}</Label>
                <div className="flex flex-col gap-1 rounded-md border border-input p-2">
                  {roles.map((role) => (
                    <label
                      key={role.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent"
                    >
                      <Checkbox
                        checked={roleIds.includes(role.id)}
                        onChange={() => toggleRole(role.id)}
                      />
                      {role.name}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t("boardDialog.rolesHint")}</p>
              </div>
            )}
            <DialogFooter className="gap-2 sm:justify-between">
              {isEdit && canDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  {t("boardDialog.delete")}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  {t("boardDialog.cancel")}
                </Button>
                <Button type="submit" disabled={isBusy}>
                  {isBusy
                    ? isEdit
                      ? t("boardDialog.saving")
                      : t("boardDialog.creating")
                    : isEdit
                      ? t("boardDialog.save")
                      : t("boardDialog.create")}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {isEdit && board && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t("boardDialog.deleteConfirmTitle")}
          description={t("boardDialog.deleteConfirmBody")}
          cancelLabel={t("boardDialog.cancel")}
          confirmLabel={t("boardDialog.delete")}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate({ id: board.id })}
        />
      )}
    </>
  );
}
