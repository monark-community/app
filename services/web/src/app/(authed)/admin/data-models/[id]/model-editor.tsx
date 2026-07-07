"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { GripVertical, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/patterns";
import { DirtyFormBar } from "@/components/dirty-form-bar";
import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/page-section";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { FieldEditorDialog, type FieldEditorValue } from "./field-editor-dialog";

interface DataModelInitial {
  id: string;
  name: string;
  key: string;
  description: string | null;
  icon: string | null;
  titleFieldId: string | null;
  organizationId: string | null;
}

export function ModelEditor({ initial }: { initial: DataModelInitial }) {
  const t = useTranslations("admin.dataModels.editor");
  const tSettings = useTranslations("admin.dataModels.editor.settings");
  const tFields = useTranslations("admin.dataModels.editor.fields");
  const utils = trpc.useUtils();

  // ── Settings ─────────────────────────────────────────────
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [icon, setIcon] = useState(initial.icon ?? "");
  const [titleFieldId, setTitleFieldId] = useState(initial.titleFieldId ?? "");

  const dirty =
    name !== initial.name ||
    description !== (initial.description ?? "") ||
    icon !== (initial.icon ?? "") ||
    titleFieldId !== (initial.titleFieldId ?? "");

  const updateModelMutation = trpc.dataModels.models.update.useMutation({
    onSuccess: () => {
      toast.success(tSettings("success"));
      utils.dataModels.models.getById.invalidate({ id: initial.id });
      utils.dataModels.models.list.invalidate();
    },
    onError: (err) => toast.error(tSettings("error") + ` (${err.message})`),
  });

  function revertSettings() {
    setName(initial.name);
    setDescription(initial.description ?? "");
    setIcon(initial.icon ?? "");
    setTitleFieldId(initial.titleFieldId ?? "");
  }

  function saveSettings() {
    updateModelMutation.mutate({
      id: initial.id,
      name,
      description: description || null,
      icon: icon || null,
      titleFieldId: titleFieldId || null,
    });
  }

  // ── Fields ───────────────────────────────────────────────
  const fieldsQuery = trpc.dataModels.fields.list.useQuery({ dataModelId: initial.id });
  // Explicit annotation : letting `fields` keep tRPC's fully-inferred query
  // type (a very deep generic over the whole merged AppRouter) blows up
  // TS's instantiation depth the moment it's `.map()`'d or passed around ;
  // `FieldRow` is a plain, hand-written structural type instead.
  //
  // Held in local state so a drag reorder is optimistic (the row moves on drop,
  // not after the round-trip) ; re-synced whenever the server list changes.
  const [fields, setFields] = useState<FieldRow[]>([]);
  useEffect(() => {
    setFields(fieldsQuery.data ?? []);
  }, [fieldsQuery.data]);

  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<FieldEditorValue | undefined>(undefined);
  const [archiveTarget, setArchiveTarget] = useState<FieldEditorValue | null>(null);

  const archiveMutation = trpc.dataModels.fields.archive.useMutation({
    onSuccess: () => {
      toast.success(tFields("archive.success"));
      utils.dataModels.fields.list.invalidate({ dataModelId: initial.id });
      setArchiveTarget(null);
    },
    onError: (err) => toast.error(tFields("archive.error") + ` (${err.message})`),
  });
  const unarchiveMutation = trpc.dataModels.fields.unarchive.useMutation({
    onSuccess: () => {
      toast.success(tFields("unarchiveSuccess"));
      utils.dataModels.fields.list.invalidate({ dataModelId: initial.id });
    },
    onError: (err) => toast.error(tFields("unarchiveError") + ` (${err.message})`),
  });
  const reorderMutation = trpc.dataModels.fields.reorder.useMutation({
    onSuccess: () => {
      utils.dataModels.fields.list.invalidate({ dataModelId: initial.id });
    },
    onError: (err) => {
      toast.error(tFields("reorderError") + ` (${err.message})`);
      // Re-sync from the server so an optimistic drag doesn't stick on failure.
      utils.dataModels.fields.list.invalidate({ dataModelId: initial.id });
    },
  });
  const requestIndexMutation = trpc.dataModels.fields.requestIndex.useMutation({
    onSuccess: () => {
      toast.success(tFields("indexRequested"));
      utils.dataModels.fields.list.invalidate({ dataModelId: initial.id });
    },
    onError: (err) => toast.error(tFields("indexError") + ` (${err.message})`),
  });

  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleFieldDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(fields, oldIndex, newIndex);
    setFields(next); // optimistic
    reorderMutation.mutate({ dataModelId: initial.id, orderedIds: next.map((f) => f.id) });
  }

  const titleFieldOptions = fields.filter((f) => !f.archivedAt);

  return (
    <div className="space-y-6">
      <PageHeader
        title={initial.name}
        subtitle={initial.key}
        backHref="/admin/data-models"
        backLabel={t("back")}
      />

      <PageSection title={tSettings("title")} subtitle={tSettings("subtitle")}>
        <div className="@container space-y-4">
          <div className="grid gap-4 @lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="model-name">{tSettings("nameLabel")}</Label>
              <Input
                id="model-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model-icon">{tSettings("iconLabel")}</Label>
              <Input
                id="model-icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder={tSettings("iconPlaceholder")}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="model-description">{tSettings("descriptionLabel")}</Label>
            <Textarea
              id="model-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{tSettings("titleFieldLabel")}</Label>
            <Select
              value={titleFieldId || "__none"}
              onValueChange={(v) => setTitleFieldId(v === "__none" ? "" : v)}
            >
              <SelectTrigger className="max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">{tSettings("titleFieldNone")}</SelectItem>
                {titleFieldOptions.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{tSettings("titleFieldHint")}</p>
          </div>
        </div>
      </PageSection>

      <Separator />

      <PageSection
        title={tFields("title")}
        subtitle={tFields("subtitle")}
        action={
          <Button
            size="sm"
            onClick={() => {
              setEditingField(undefined);
              setFieldDialogOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            {tFields("addCta")}
          </Button>
        }
      >
        {fieldsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tFields("empty")}</p>
        ) : (
          <DndContext
            sensors={dragSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleFieldDragEnd}
          >
            <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              <ul className="divide-y divide-border rounded-md border border-border">
                {fields.map((field) => (
                  <SortableFieldRow
                    key={field.id}
                    id={field.id}
                    dragLabel={tFields("dragToReorder")}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{field.label}</span>
                        <Badge variant="outline" size="sm">
                          {field.type}
                        </Badge>
                        {field.id === titleFieldId && (
                          <Badge variant="secondary" size="sm">
                            {tSettings("titleFieldLabel")}
                          </Badge>
                        )}
                        {field.required && (
                          <Badge variant="outline" size="sm">
                            {tFields("requiredBadge")}
                          </Badge>
                        )}
                        {field.indexed && (
                          <Badge variant="success" size="sm">
                            {tFields("indexedBadge")}
                          </Badge>
                        )}
                        {field.archivedAt && (
                          <Badge variant="outline" size="sm" className="text-muted-foreground">
                            {tFields("archivedBadge")}
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{field.key}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={tFields("title")}
                        >
                          <MoreHorizontal className="h-4 w-4" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditingField({
                              id: field.id,
                              key: field.key,
                              label: field.label,
                              description: field.description,
                              type: field.type as FieldEditorValue["type"],
                              config: field.config,
                              required: field.required,
                            });
                            setFieldDialogOpen(true);
                          }}
                        >
                          {tFields("actions.edit")}
                        </DropdownMenuItem>
                        {!field.archivedAt && field.id !== titleFieldId && (
                          <DropdownMenuItem onSelect={() => setTitleFieldId(field.id)}>
                            {tFields("actions.makeTitleField")}
                          </DropdownMenuItem>
                        )}
                        {!field.archivedAt && !field.indexed && (
                          <DropdownMenuItem
                            onSelect={() => requestIndexMutation.mutate({ id: field.id })}
                          >
                            {tFields("actions.requestIndex")}
                          </DropdownMenuItem>
                        )}
                        {field.archivedAt ? (
                          <DropdownMenuItem
                            onSelect={() => unarchiveMutation.mutate({ id: field.id })}
                          >
                            {tFields("actions.unarchive")}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() =>
                              setArchiveTarget({
                                id: field.id,
                                key: field.key,
                                label: field.label,
                                description: field.description,
                                type: field.type as FieldEditorValue["type"],
                                config: field.config,
                                required: field.required,
                              })
                            }
                          >
                            {tFields("actions.archive")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SortableFieldRow>
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </PageSection>

      <Separator />

      <IntegrationsSection dataModelId={initial.id} fields={fields} />

      <FieldEditorDialog
        open={fieldDialogOpen}
        onOpenChange={setFieldDialogOpen}
        dataModelId={initial.id}
        field={editingField}
        onSaved={() => setFieldDialogOpen(false)}
      />

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={tFields("archive.title")}
        description={
          archiveTarget ? tFields("archive.description", { label: archiveTarget.label }) : ""
        }
        cancelLabel={tFields("archive.cancel")}
        confirmLabel={tFields("archive.confirm")}
        onConfirm={() => archiveTarget && archiveMutation.mutate({ id: archiveTarget.id })}
        isPending={archiveMutation.isPending}
      />

      <DirtyFormBar
        open={dirty}
        onSave={saveSettings}
        onCancel={revertSettings}
        saving={updateModelMutation.isPending}
        saveLabel={tSettings("save")}
        savingLabel={tSettings("saving")}
        cancelLabel={tSettings("cancel")}
        containment="viewport"
      />
    </div>
  );
}

// Hand-written rather than derived from the query's inferred type — a
// generic `ReturnType<...>["data"]` extraction over a tRPC hook blows up
// TS's instantiation depth. Structural typing means the real query result
// (a superset of these fields) is still assignable wherever this is used.
interface FieldRow {
  id: string;
  dataModelId: string;
  key: string;
  label: string;
  description: string | null;
  type: string;
  config: unknown;
  required: boolean;
  position: number;
  indexed: boolean;
  archivedAt: string | null;
}

/** One draggable field row : a grip handle on the left (the drag affordance)
 *  followed by the field content passed as `children`. Reorder is driven by the
 *  parent's `DndContext` / `SortableContext`. */
function SortableFieldRow({
  id,
  dragLabel,
  children,
}: {
  id: string;
  dragLabel: string;
  children: ReactNode;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-3 px-4 py-3", isDragging && "z-10 bg-accent shadow-sm")}
    >
      <button
        type="button"
        aria-label={dragLabel}
        className="flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      {children}
    </li>
  );
}

function IntegrationsSection({ dataModelId, fields }: { dataModelId: string; fields: FieldRow[] }) {
  const t = useTranslations("admin.dataModels.editor.integrations");
  const utils = trpc.useUtils();

  const availableQuery = trpc.dataModels.integrations.listAvailable.useQuery();
  const savedQuery = trpc.dataModels.integrations.get.useQuery({ dataModelId });

  const saveMutation = trpc.dataModels.integrations.save.useMutation({
    onSuccess: () => {
      toast.success(t("success"));
      utils.dataModels.integrations.get.invalidate({ dataModelId });
    },
    onError: (err) => toast.error(t("error") + ` (${err.message})`),
  });

  const available = availableQuery.data ?? [];
  const saved = savedQuery.data ?? [];

  if (available.length === 0 && !availableQuery.isLoading) {
    return (
      <PageSection title={t("title")} subtitle={t("subtitle")}>
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      </PageSection>
    );
  }

  return (
    <PageSection title={t("title")} subtitle={t("subtitle")}>
      <div className="space-y-4">
        {available.map((integration) => (
          <IntegrationCard
            key={integration.module}
            module={integration.module}
            description={integration.description}
            slots={integration.slots}
            fields={fields}
            initialMapping={saved.find((s) => s.module === integration.module)}
            onSave={(slotMappings, enabled) =>
              saveMutation.mutate({
                dataModelId,
                module: integration.module,
                slotMappings,
                enabled,
              })
            }
            isPending={saveMutation.isPending}
          />
        ))}
      </div>
    </PageSection>
  );
}

interface SlotDef {
  types: string[];
  required: boolean;
  relationTarget?: string;
  description: string;
}

function IntegrationCard({
  module,
  description,
  slots,
  fields,
  initialMapping,
  onSave,
  isPending,
}: {
  module: string;
  description: string;
  slots: Record<string, SlotDef>;
  fields: FieldRow[];
  initialMapping: { slotMappings: unknown; enabled: boolean } | undefined;
  onSave: (slotMappings: Record<string, string>, enabled: boolean) => void;
  isPending: boolean;
}) {
  const t = useTranslations("admin.dataModels.editor.integrations");
  const initial = (initialMapping?.slotMappings as Record<string, string> | undefined) ?? {};
  const [mapping, setMapping] = useState<Record<string, string>>(initial);
  const [enabled, setEnabled] = useState(initialMapping?.enabled ?? false);

  useEffect(() => {
    setMapping((initialMapping?.slotMappings as Record<string, string> | undefined) ?? {});
    setEnabled(initialMapping?.enabled ?? false);
  }, [initialMapping]);

  const missingRequired = Object.entries(slots).some(
    ([key, slot]) => slot.required && !mapping[key],
  );

  return (
    <div className="rounded-md border border-border p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium capitalize">{module}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`${module}-enabled`} className="text-sm">
            {t("enabledLabel")}
          </Label>
          <input
            id={`${module}-enabled`}
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4"
          />
        </div>
      </div>
      <div className="space-y-3">
        {Object.entries(slots).map(([slotKey, slot]) => {
          const eligible = fields.filter(
            (f) =>
              !f.archivedAt &&
              slot.types.includes(f.type) &&
              (!slot.relationTarget ||
                (f.config as { relationTarget?: string } | null)?.relationTarget ===
                  slot.relationTarget),
          );
          return (
            <div key={slotKey} className="space-y-1.5">
              <Label>
                {slotKey}
                {slot.required && <span className="text-destructive"> *</span>}
              </Label>
              <Select
                value={mapping[slotKey] ?? "__none"}
                onValueChange={(v) =>
                  setMapping((prev) => ({ ...prev, [slotKey]: v === "__none" ? "" : v }))
                }
              >
                <SelectTrigger className="max-w-sm">
                  <SelectValue placeholder={t("slotPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t("slotPlaceholder")}</SelectItem>
                  {eligible.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{slot.description}</p>
            </div>
          );
        })}
      </div>
      {missingRequired && enabled && (
        <p className="mt-3 text-xs text-destructive">{t("missingRequired")}</p>
      )}
      <div className="mt-4">
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={() => {
            const cleaned = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v));
            onSave(cleaned, enabled);
          }}
        >
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
