"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CalendarDef } from "@monark/calendar/contracts";
import { FieldRow, FormActionsFooter } from "@/components/patterns";
import { ColorInput } from "@/components/ui/color-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
          const id = calendar.id;
          onClose();
          // Defer past the dialog's close cleanup: the delete's refetch
          // unmounts this subtree, and if that happens mid-close Radix never
          // restores `body` pointer-events, freezing the whole page.
          setTimeout(() => onDelete(id), 0);
        }
      : undefined;

  const fields = (
    <>
      <FieldRow label={t("nameLabel")} htmlFor="cm-name">
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
      </FieldRow>

      <FieldRow label={t("descriptionLabel")} htmlFor="cm-desc">
        <Textarea
          id="cm-desc"
          rows={2}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </FieldRow>

      <FieldRow label={t("colorLabel")} htmlFor="cm-color">
        <ColorInput
          id="cm-color"
          value={form.color}
          onChange={(hex) => set("color", hex)}
          aria-label={t("colorLabel")}
        />
      </FieldRow>

      {roles.length > 0 && (
        <FieldRow label={t("rolesLabel")}>
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
        </FieldRow>
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
              <div className="@container min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                {fields}
              </div>
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSave();
              }}
              className="@container flex flex-col gap-4 pt-2"
            >
              {fields}
              <FormActionsFooter
                submitLabel={t("save")}
                cancelLabel={t("cancel")}
                onCancel={onClose}
                onDelete={triggerDelete}
                deleteLabel={t("delete")}
                className="mt-2"
              />
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
