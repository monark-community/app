"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Award, Image as ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { ACHIEVEMENT_ICONS_BUCKET } from "@monark/achievements/contracts";
import { trpc } from "@/lib/trpc";
import { useFileUpload } from "@/hooks/use-file-upload";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";

type Achievement = ReturnType<typeof useAchievements>["data"] extends (infer A)[] | undefined
  ? A
  : never;
type Rule = Achievement extends { rules: (infer R)[] } ? R : never;
type EventTypeGroup = {
  module: string;
  events: {
    type: string;
    description: string;
    fields: { key: string; type: string; description: string }[];
  }[];
};

function useAchievements() {
  return trpc.achievements.list.useQuery();
}

export function AchievementsManager() {
  const t = useTranslations("admin.achievements");
  const utils = trpc.useUtils();
  const list = useAchievements();
  const eventTypes = trpc.achievements.eventTypes.useQuery();

  const [achDialog, setAchDialog] = useState<
    { mode: "create" } | { mode: "edit"; a: Achievement } | null
  >(null);
  const [ruleDialog, setRuleDialog] = useState<{ achievementId: string; rule?: Rule } | null>(null);
  const [confirm, setConfirm] = useState<{
    kind: "achievement" | "rule";
    id: string;
    name: string;
  } | null>(null);

  const invalidate = () => utils.achievements.list.invalidate();

  const deleteAchievement = trpc.achievements.delete.useMutation({
    onSuccess: () => {
      toast.success(t("toast.deleted"));
      setConfirm(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteRule = trpc.achievements.rules.delete.useMutation({
    onSuccess: () => {
      toast.success(t("toast.ruleDeleted"));
      setConfirm(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const toggleEnabled = trpc.achievements.update.useMutation({
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e.message),
  });

  if (list.isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }
  const achievements = list.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setAchDialog({ mode: "create" })}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden /> {t("new")}
        </Button>
      </div>

      {achievements.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {achievements.map((a) => (
            <li key={a.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start gap-3">
                {a.iconUrl ? (
                  <img src={a.iconUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                ) : (
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground"
                    aria-hidden
                  >
                    <Award className="h-5 w-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{a.name}</span>
                    <Badge variant="secondary">{t("points", { points: a.points })}</Badge>
                    {!a.enabled && <Badge variant="outline">{t("disabled")}</Badge>}
                  </div>
                  {a.description && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{a.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={a.enabled}
                    onCheckedChange={(v) => toggleEnabled.mutate({ id: a.id, enabled: v })}
                    aria-label={t("enabledToggle")}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setAchDialog({ mode: "edit", a })}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setConfirm({ kind: "achievement", id: a.id, name: a.name })}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </Button>
                </div>
              </div>

              {/* Conditions */}
              <div className="mt-3 space-y-1.5 border-t pt-3">
                {a.rules.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("noRules")}</p>
                ) : (
                  a.rules.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-sm">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.eventType}</code>
                      <span className="text-muted-foreground">
                        {t("ruleSummary", { count: r.threshold, subject: r.subjectField })}
                        {r.match
                          ? ` · ${Object.entries(r.match)
                              .map(([k, v]) => `${k}=${v}`)
                              .join(", ")}`
                          : ""}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setRuleDialog({ achievementId: a.id, rule: r })}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setConfirm({ kind: "rule", id: r.id, name: r.eventType })}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-7 gap-1 text-xs"
                  onClick={() => setRuleDialog({ achievementId: a.id })}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden /> {t("addRule")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {achDialog && (
        <AchievementDialog
          state={achDialog}
          onClose={() => setAchDialog(null)}
          onSaved={() => {
            setAchDialog(null);
            invalidate();
          }}
        />
      )}
      {ruleDialog && (
        <RuleDialog
          achievementId={ruleDialog.achievementId}
          rule={ruleDialog.rule}
          eventGroups={(eventTypes.data ?? []) as EventTypeGroup[]}
          onClose={() => setRuleDialog(null)}
          onSaved={() => {
            setRuleDialog(null);
            invalidate();
          }}
        />
      )}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === "rule" ? t("confirmRuleTitle") : t("confirmTitle")}
        description={t("confirmDescription", { name: confirm?.name ?? "" })}
        cancelLabel={t("cancel")}
        confirmLabel={t("delete")}
        isPending={deleteAchievement.isPending || deleteRule.isPending}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === "rule") deleteRule.mutate({ id: confirm.id });
          else deleteAchievement.mutate({ id: confirm.id });
        }}
      />
    </div>
  );
}

function AchievementDialog({
  state,
  onClose,
  onSaved,
}: {
  state: { mode: "create" } | { mode: "edit"; a: Achievement };
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("admin.achievements");
  const utils = trpc.useUtils();
  const existing = state.mode === "edit" ? state.a : null;
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [points, setPoints] = useState(String(existing?.points ?? 0));
  const [iconFileId, setIconFileId] = useState<string | null>(existing?.iconFileId ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(existing?.iconUrl ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading } = useFileUpload();

  const create = trpc.achievements.create.useMutation({
    onSuccess: () => {
      toast.success(t("toast.saved"));
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.achievements.update.useMutation({
    onSuccess: () => {
      toast.success(t("toast.saved"));
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });
  const pending = create.isPending || update.isPending;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const stored = await upload(file, { bucket: ACHIEVEMENT_ICONS_BUCKET });
      setIconFileId(stored.id);
      const { url } = await utils.files.downloadUrl.fetch({ fileId: stored.id });
      setPreviewUrl(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("form.uploadError"));
    }
  }

  function save() {
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      iconFileId,
      points: Number(points) || 0,
    };
    if (existing)
      update.mutate({ id: existing.id, ...payload, description: description.trim() || null });
    else create.mutate(payload);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? t("editTitle") : t("newTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("form.name")}
            maxLength={120}
            autoFocus
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("form.description")}
            rows={2}
            maxLength={1000}
          />
          {/* Badge : an uploaded image ; a neutral placeholder until one is set. */}
          <div className="flex items-center gap-3">
            {previewUrl ? (
              <img src={previewUrl} alt="" className="h-12 w-12 rounded border object-cover" />
            ) : (
              <span
                className="flex h-12 w-12 items-center justify-center rounded border bg-muted text-muted-foreground"
                aria-hidden
              >
                <Award className="h-6 w-6" />
              </span>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFile}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading}
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon className="mr-1.5 h-4 w-4" aria-hidden />
              {isUploading ? t("form.uploading") : t("form.uploadIcon")}
            </Button>
            {(previewUrl || iconFileId) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIconFileId(null);
                  setPreviewUrl(null);
                }}
              >
                {t("form.removeIcon")}
              </Button>
            )}
          </div>
          <Input
            value={points}
            onChange={(e) => setPoints(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={t("form.points")}
            inputMode="numeric"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={!name.trim() || pending} onClick={save}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleDialog({
  achievementId,
  rule,
  eventGroups,
  onClose,
  onSaved,
}: {
  achievementId: string;
  rule?: Rule;
  eventGroups: EventTypeGroup[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("admin.achievements");
  const [eventType, setEventType] = useState(rule?.eventType ?? "");
  const [threshold, setThreshold] = useState(String(rule?.threshold ?? 1));
  const [subjectField, setSubjectField] = useState(rule?.subjectField ?? "actorId");
  const [match, setMatch] = useState<Array<{ key: string; value: string }>>(
    rule?.match
      ? Object.entries(rule.match).map(([key, value]) => ({ key, value: String(value) }))
      : [],
  );

  const fields = useMemo(() => {
    for (const g of eventGroups) {
      const e = g.events.find((ev) => ev.type === eventType);
      if (e) return e.fields;
    }
    return [];
  }, [eventGroups, eventType]);

  const create = trpc.achievements.rules.create.useMutation({
    onSuccess: () => {
      toast.success(t("toast.ruleSaved"));
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.achievements.rules.update.useMutation({
    onSuccess: () => {
      toast.success(t("toast.ruleSaved"));
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });
  const pending = create.isPending || update.isPending;

  function save() {
    const matchObj = match
      .filter((m) => m.key.trim())
      .reduce<Record<string, string>>((acc, m) => {
        acc[m.key.trim()] = m.value;
        return acc;
      }, {});
    const payload = {
      eventType,
      threshold: Math.max(1, Number(threshold) || 1),
      subjectField: subjectField.trim() || "actorId",
      match: Object.keys(matchObj).length ? matchObj : null,
    };
    if (rule) update.mutate({ id: rule.id, ...payload });
    else create.mutate({ achievementId, ...payload });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? t("editRuleTitle") : t("addRuleTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("form.eventType")}
            </label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger>
                <SelectValue placeholder={t("form.eventTypePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {eventGroups.map((g) => (
                  <SelectGroup key={g.module}>
                    <SelectLabel>{g.module}</SelectLabel>
                    {g.events.map((e) => (
                      <SelectItem key={e.type} value={e.type}>
                        {e.type}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-3">
            <div className="w-28">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("form.threshold")}
              </label>
              <Input
                value={threshold}
                onChange={(e) => setThreshold(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("form.subject")}
              </label>
              <Select value={subjectField} onValueChange={setSubjectField}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(fields.length ? fields.map((f) => f.key) : ["actorId"]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                  {!fields.some((f) => f.key === "actorId") && subjectField === "actorId" && (
                    <SelectItem value="actorId">actorId</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("form.match")}
            </label>
            <div className="space-y-2">
              {match.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    value={m.key}
                    onValueChange={(v) =>
                      setMatch((prev) => prev.map((x, j) => (j === i ? { ...x, key: v } : x)))
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={t("form.matchField")} />
                    </SelectTrigger>
                    <SelectContent>
                      {fields.map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.key}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">=</span>
                  <Input
                    className="flex-1"
                    value={m.value}
                    onChange={(e) =>
                      setMatch((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                      )
                    }
                    placeholder={t("form.matchValue")}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setMatch((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={!eventType}
                onClick={() => setMatch((prev) => [...prev, { key: "", value: "" }])}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> {t("form.addMatch")}
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={!eventType || pending} onClick={save}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
