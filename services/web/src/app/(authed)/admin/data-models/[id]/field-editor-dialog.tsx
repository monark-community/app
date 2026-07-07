"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import type { DataFieldServerType } from "@/components/fields";

const FIELD_TYPES: DataFieldServerType[] = [
  "TEXT",
  "LONG_TEXT",
  "RICH_TEXT",
  "NUMBER",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "SELECT",
  "MULTI_SELECT",
  "RELATION",
  "URL",
  "EMAIL",
];

// System models a RELATION field can target beyond another Data Model.
// v1 supports "Calendar" (the calendar integration's own slot already
// targets it) ; more can be added here as other modules expose a
// relation-friendly system model.
const SYSTEM_RELATION_TARGETS = ["Calendar"];

export interface FieldEditorValue {
  id: string;
  key: string;
  label: string;
  description: string | null;
  type: DataFieldServerType;
  config: unknown;
  required: boolean;
}

interface OptionRow {
  value: string;
  label: string;
}

export function FieldEditorDialog({
  open,
  onOpenChange,
  dataModelId,
  field,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataModelId: string;
  /** Omit to create a new field. */
  field?: FieldEditorValue;
  onSaved: () => void;
}) {
  const t = useTranslations("admin.dataModels.editor.fieldDialog");
  const isEdit = !!field;

  const [label, setLabel] = useState(field?.label ?? "");
  const [key, setKey] = useState(field?.key ?? "");
  const [description, setDescription] = useState(field?.description ?? "");
  const [type, setType] = useState<DataFieldServerType>(field?.type ?? "TEXT");
  const [required, setRequired] = useState(field?.required ?? false);

  // Type-specific config, kept as loosely-typed local state ; assembled
  // into the right shape for `fieldConfigSchemas[type]` on submit.
  const initialConfig = (field?.config as Record<string, unknown> | undefined) ?? {};
  const [minLength, setMinLength] = useState<string>(String(initialConfig.minLength ?? ""));
  const [maxLength, setMaxLength] = useState<string>(String(initialConfig.maxLength ?? ""));
  const [min, setMin] = useState<string>(String(initialConfig.min ?? ""));
  const [max, setMax] = useState<string>(String(initialConfig.max ?? ""));
  const [integer, setInteger] = useState<boolean>(Boolean(initialConfig.integer));
  const [options, setOptions] = useState<OptionRow[]>(
    Array.isArray(initialConfig.options) ? (initialConfig.options as OptionRow[]) : [],
  );
  const [allowCustomValues, setAllowCustomValues] = useState<boolean>(
    Boolean(initialConfig.allowCustomValues),
  );
  const [maxItems, setMaxItems] = useState<string>(String(initialConfig.max ?? ""));
  const [relationTarget, setRelationTarget] = useState<string>(
    (initialConfig.relationTarget as string) ?? "",
  );
  const [relationTargetKind, setRelationTargetKind] = useState<"DATA_MODEL" | "SYSTEM_MODEL">(
    (initialConfig.relationTargetKind as "DATA_MODEL" | "SYSTEM_MODEL") ?? "DATA_MODEL",
  );
  const [cardinality, setCardinality] = useState<"ONE" | "MANY">(
    (initialConfig.cardinality as "ONE" | "MANY") ?? "ONE",
  );

  // Reset local state whenever a different field (or "new") is opened.
  useEffect(() => {
    if (!open) return;
    const cfg = (field?.config as Record<string, unknown> | undefined) ?? {};
    setLabel(field?.label ?? "");
    setKey(field?.key ?? "");
    setDescription(field?.description ?? "");
    setType(field?.type ?? "TEXT");
    setRequired(field?.required ?? false);
    setMinLength(String(cfg.minLength ?? ""));
    setMaxLength(String(cfg.maxLength ?? ""));
    setMin(String(cfg.min ?? ""));
    setMax(String(cfg.max ?? ""));
    setInteger(Boolean(cfg.integer));
    setOptions(Array.isArray(cfg.options) ? (cfg.options as OptionRow[]) : []);
    setAllowCustomValues(Boolean(cfg.allowCustomValues));
    setMaxItems(String(cfg.max ?? ""));
    setRelationTarget((cfg.relationTarget as string) ?? "");
    setRelationTargetKind(
      (cfg.relationTargetKind as "DATA_MODEL" | "SYSTEM_MODEL") ?? "DATA_MODEL",
    );
    setCardinality((cfg.cardinality as "ONE" | "MANY") ?? "ONE");
    // Deliberately keyed on `open` + `field?.id` only : this resets the form
    // to match whichever field (or "new") was just opened, not on every
    // re-render `field` happens to produce a new object reference.
  }, [open, field?.id]);

  const otherModelsQuery = trpc.dataModels.models.list.useQuery(
    { limit: 100 },
    { enabled: open && type === "RELATION", refetchOnWindowFocus: false },
  );
  // Explicit annotation for the same reason as ModelEditor's `FieldRow` —
  // keeping tRPC's deep inferred type here blows up TS's instantiation depth.
  const otherModelItems: Array<{ id: string; key: string; name: string }> =
    otherModelsQuery.data?.items ?? [];
  const otherModels = otherModelItems.filter((m) => m.id !== dataModelId);

  const utils = trpc.useUtils();
  const createMutation = trpc.dataModels.fields.create.useMutation({
    onSuccess: () => {
      toast.success(t("success"));
      utils.dataModels.fields.list.invalidate({ dataModelId });
      onSaved();
    },
    onError: (err) => toast.error(t("error") + ` (${err.message})`),
  });
  const updateMutation = trpc.dataModels.fields.update.useMutation({
    onSuccess: () => {
      toast.success(t("success"));
      utils.dataModels.fields.list.invalidate({ dataModelId });
      onSaved();
    },
    onError: (err) => toast.error(t("error") + ` (${err.message})`),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const config = useMemo((): unknown => {
    const num = (s: string): number | undefined => (s.trim() === "" ? undefined : Number(s));
    switch (type) {
      case "TEXT":
      case "LONG_TEXT":
        return { minLength: num(minLength), maxLength: num(maxLength) };
      case "URL":
      case "EMAIL":
        return { maxLength: num(maxLength) };
      case "NUMBER":
        return { min: num(min), max: num(max), integer };
      case "SELECT":
        return { options };
      case "MULTI_SELECT":
        return { options, allowCustomValues, max: num(maxItems) };
      case "RELATION":
        return { relationTarget, relationTargetKind, cardinality };
      case "RICH_TEXT":
      case "BOOLEAN":
      case "DATE":
      case "DATETIME":
      default:
        return {};
    }
  }, [
    type,
    minLength,
    maxLength,
    min,
    max,
    integer,
    options,
    allowCustomValues,
    maxItems,
    relationTarget,
    relationTargetKind,
    cardinality,
  ]);

  function handleSubmit() {
    if (isEdit && field) {
      updateMutation.mutate({
        id: field.id,
        label,
        description: description || null,
        required,
        config,
      });
      return;
    }
    createMutation.mutate({
      dataModelId,
      key: key || undefined,
      label,
      description: description || null,
      type,
      required,
      config,
    });
  }

  function addOption() {
    setOptions((prev) => [...prev, { value: "", label: "" }]);
  }
  function updateOption(index: number, patch: Partial<OptionRow>) {
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }
  function removeOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? t("editTitle") : t("createTitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="field-label">{t("labelLabel")}</Label>
            <Input
              id="field-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("labelPlaceholder")}
              maxLength={80}
            />
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="field-key">{t("keyLabel")}</Label>
              <Input id="field-key" value={key} onChange={(e) => setKey(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("keyHint")}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="field-description">{t("descriptionLabel")}</Label>
            <Textarea
              id="field-description"
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("typeLabel")}</Label>
            {isEdit ? (
              <p className="text-sm text-muted-foreground">
                {t(`types.${type}`)} — {t("typeHint")}
              </p>
            ) : (
              <Select value={type} onValueChange={(v) => setType(v as DataFieldServerType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((ft) => (
                    <SelectItem key={ft} value={ft}>
                      {t(`types.${ft}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="field-required">{t("requiredLabel")}</Label>
            <Switch id="field-required" checked={required} onCheckedChange={setRequired} />
          </div>

          {(type === "TEXT" || type === "LONG_TEXT") && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="field-minLength">{t("config.minLength")}</Label>
                <Input
                  id="field-minLength"
                  type="number"
                  value={minLength}
                  onChange={(e) => setMinLength(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="field-maxLength">{t("config.maxLength")}</Label>
                <Input
                  id="field-maxLength"
                  type="number"
                  value={maxLength}
                  onChange={(e) => setMaxLength(e.target.value)}
                />
              </div>
            </div>
          )}

          {(type === "URL" || type === "EMAIL") && (
            <div className="space-y-1.5">
              <Label htmlFor="field-maxLength2">{t("config.maxLength")}</Label>
              <Input
                id="field-maxLength2"
                type="number"
                value={maxLength}
                onChange={(e) => setMaxLength(e.target.value)}
              />
            </div>
          )}

          {type === "NUMBER" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="field-min">{t("config.min")}</Label>
                  <Input
                    id="field-min"
                    type="number"
                    value={min}
                    onChange={(e) => setMin(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="field-max">{t("config.max")}</Label>
                  <Input
                    id="field-max"
                    type="number"
                    value={max}
                    onChange={(e) => setMax(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="field-integer">{t("config.integer")}</Label>
                <Switch id="field-integer" checked={integer} onCheckedChange={setInteger} />
              </div>
            </div>
          )}

          {(type === "SELECT" || type === "MULTI_SELECT") && (
            <div className="space-y-2">
              <Label>{t("config.options")}</Label>
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    aria-label={t("config.optionValue")}
                    placeholder={t("config.optionValue")}
                    value={option.value}
                    onChange={(e) => updateOption(index, { value: e.target.value })}
                    className="w-1/3"
                  />
                  <Input
                    aria-label={t("config.optionLabel")}
                    placeholder={t("config.optionLabel")}
                    value={option.label}
                    onChange={(e) => updateOption(index, { label: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("config.removeOption")}
                    onClick={() => removeOption(index)}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addOption}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                {t("config.addOption")}
              </Button>
              {type === "MULTI_SELECT" && (
                <>
                  <div className="flex items-center justify-between pt-2">
                    <Label htmlFor="field-allowCustom">{t("config.allowCustomValues")}</Label>
                    <Switch
                      id="field-allowCustom"
                      checked={allowCustomValues}
                      onCheckedChange={setAllowCustomValues}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="field-maxItems">{t("config.maxItems")}</Label>
                    <Input
                      id="field-maxItems"
                      type="number"
                      value={maxItems}
                      onChange={(e) => setMaxItems(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {type === "RELATION" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t("config.relationTarget")}</Label>
                <Select
                  value={relationTarget ? `${relationTargetKind}:${relationTarget}` : ""}
                  onValueChange={(v) => {
                    const [kind, target] = v.split(":") as ["DATA_MODEL" | "SYSTEM_MODEL", string];
                    setRelationTargetKind(kind);
                    setRelationTarget(target);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("config.relationTargetPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {SYSTEM_RELATION_TARGETS.map((sys) => (
                      <SelectItem key={sys} value={`SYSTEM_MODEL:${sys}`}>
                        {sys}
                      </SelectItem>
                    ))}
                    {otherModels.map((m) => (
                      <SelectItem key={m.id} value={`DATA_MODEL:${m.key}`}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("config.cardinality")}</Label>
                <Select
                  value={cardinality}
                  onValueChange={(v) => setCardinality(v as "ONE" | "MANY")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ONE">{t("config.cardinalityOne")}</SelectItem>
                    <SelectItem value="MANY">{t("config.cardinalityMany")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {cardinality === "MANY" && (
                <div className="space-y-1.5">
                  <Label htmlFor="field-maxItems2">{t("config.maxItems")}</Label>
                  <Input
                    id="field-maxItems2"
                    type="number"
                    value={maxItems}
                    onChange={(e) => setMaxItems(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending || !label.trim()}>
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
