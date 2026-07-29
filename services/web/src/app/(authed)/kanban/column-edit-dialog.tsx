"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { trpc } from "@/lib/trpc";

export type EditableColumn = {
  id: string;
  name: string;
  color: string | null;
  wipLimit: number | null;
};

/** Quick per-column editor (name / colour / card limit), opened from the
 *  column header "…" menu. */
export function ColumnEditDialog({
  column,
  onClose,
  onSaved,
}: {
  column: EditableColumn;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("kanban");
  const [name, setName] = useState(column.name);
  const [color, setColor] = useState(column.color ?? "");
  const [wip, setWip] = useState(column.wipLimit == null ? "" : String(column.wipLimit));

  const updateMutation = trpc.kanban.columns.update.useMutation({
    onSuccess: () => {
      onSaved();
    },
    onError: (err) => toast.error(t("column.errorToast", { message: err.message })),
  });

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("column.nameRequired"));
      return;
    }
    let wipLimit: number | null = null;
    const rawWip = wip.trim();
    if (rawWip !== "") {
      const n = Number.parseInt(rawWip, 10);
      if (!Number.isFinite(n) || n < 1 || n > 999) {
        toast.error(t("column.wipInvalid"));
        return;
      }
      wipLimit = n;
    }
    updateMutation.mutate({
      id: column.id,
      name: trimmed,
      color: color.trim().length > 0 ? color : null,
      wipLimit,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("column.editTitle")}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="col-name">{t("column.nameLabel")}</Label>
            <Input
              id="col-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("column.colorLabel")}</Label>
            <ColorInput value={color} onChange={setColor} aria-label={t("column.colorLabel")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="col-wip">{t("column.wipLabel")}</Label>
            <Input
              id="col-wip"
              type="number"
              min={1}
              max={999}
              inputMode="numeric"
              value={wip}
              onChange={(e) => setWip(e.target.value)}
              className="w-28"
            />
            <p className="text-xs text-muted-foreground">{t("column.wipHint")}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("column.cancel")}
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? t("column.saving") : t("column.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
