"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { CalendarDef } from "@monark/calendar/contracts";
import { FormActionsFooter } from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { ColorInput } from "@/components/ui/color-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-is-mobile";

type RoleOption = { id: string; name: string };

type FormState = {
  name: string;
  description: string;
  color: string;
  roleIds: string[];
};

function buildDefaultForm(calendar?: CalendarDef): FormState {
  return {
    name: calendar?.name ?? "",
    description: calendar?.description ?? "",
    color: calendar?.color ?? "#6366f1",
    roleIds: [],
  };
}

export function CalendarManageDialog({
  open,
  calendar,
  roles,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  calendar?: CalendarDef;
  roles: RoleOption[];
  onClose: () => void;
  onSave: (data: { name: string; description?: string; color?: string; roleIds: string[] }) => void;
  onDelete?: (id: string) => void;
}) {
  const t = useTranslations("calendar.manageCalendar");
  const isMobile = useIsMobile();
  const isEdit = calendar !== undefined;
  const [form, setForm] = useState<FormState>(() => buildDefaultForm(calendar));
  const confirmedDeleteIdRef = useRef<string | null>(null);

  // Reset form every time the dialog opens (handles both create and edit).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setForm(buildDefaultForm(calendar));
  }

  function set(field: keyof FormState, value: string | string[]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleRole(id: string) {
    setForm((f) => ({
      ...f,
      roleIds: f.roleIds.includes(id) ? f.roleIds.filter((r) => r !== id) : [...f.roleIds, id],
    }));
  }

  function handleSave() {
    if (!form.name.trim()) return;
    onSave({
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      color: form.color || undefined,
      roleIds: form.roleIds,
    });
  }

  const heading = isEdit ? t("editHeading") : t("createHeading");

  const triggerDelete =
    isEdit && onDelete && calendar
      ? () => {
          confirmedDeleteIdRef.current = calendar.id;
          onClose();
        }
      : undefined;

  const fields = (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="cm-name">{t("nameLabel")}</Label>
        <Input
          id="cm-name"
          placeholder={t("namePlaceholder")}
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSave();
            }
          }}
          autoFocus={!isMobile}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="cm-desc">{t("descriptionLabel")}</Label>
        <Textarea
          id="cm-desc"
          rows={2}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="cm-color">{t("colorLabel")}</Label>
        <ColorInput
          id="cm-color"
          value={form.color}
          onChange={(hex) => set("color", hex)}
          aria-label={t("colorLabel")}
        />
      </div>

      {roles.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>{t("rolesLabel")}</Label>
          <div className="flex flex-col gap-1 rounded-md border border-input p-2">
            {roles.map((role) => (
              <label
                key={role.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={form.roleIds.includes(role.id)}
                  onChange={() => toggleRole(role.id)}
                />
                {role.name}
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        mobileFullScreen
        className="md:max-w-md"
        onOpenAutoFocus={(e) => {
          // On mobile, don't pull focus into a field on open — it would raise the
          // keyboard before the user can see the form.
          if (isMobile) e.preventDefault();
        }}
        onCloseAutoFocus={() => {
          const id = confirmedDeleteIdRef.current;
          if (id && onDelete) {
            confirmedDeleteIdRef.current = null;
            onDelete(id);
          }
        }}
      >
        {isMobile ? (
          <>
            <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-12 text-left">
              <DialogTitle>{heading}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSave();
              }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{fields}</div>
              <FormActionsFooter
                submitLabel={t("save")}
                cancelLabel={t("cancel")}
                onCancel={onClose}
                onDelete={triggerDelete}
                deleteLabel={t("delete")}
                className="shrink-0 border-t border-border px-4 py-3"
              />
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{heading}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 pt-2">{fields}</div>

            <div className="mt-2 flex items-center gap-2">
              {triggerDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={triggerDelete}
                >
                  {t("delete")}
                </Button>
              )}
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  {t("cancel")}
                </Button>
                <Button size="sm" onClick={handleSave}>
                  {t("save")}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
