"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Copy, Mail, Plus, Trash2 } from "lucide-react";
import { PUBLIC_FORM_FIELD_TYPES } from "@monark/data-models/contracts";
import { trpc } from "@/lib/trpc";
import { PageSection } from "@/components/page-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/patterns";

interface FormFieldRow {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  archivedAt: string | null;
}

const PUBLIC_TYPES = new Set<string>(PUBLIC_FORM_FIELD_TYPES);
const origin = () => (typeof window === "undefined" ? "" : window.location.origin);

export function SharingSection({
  dataModelId,
  fields,
}: {
  dataModelId: string;
  fields: FormFieldRow[];
}) {
  const t = useTranslations("admin.dataModels.editor.sharing");
  const utils = trpc.useUtils();

  const flags =
    trpc.featureFlags.getAllForSession.useQuery(undefined, {
      refetchOnWindowFocus: false,
      staleTime: Infinity,
    }).data ?? {};
  const enabled = flags["data-models.public-forms"] === true;

  const formsQuery = trpc.dataModels.forms.list.useQuery(
    { dataModelId },
    { enabled, refetchOnWindowFocus: false },
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const publicFields = fields.filter((f) => !f.archivedAt && PUBLIC_TYPES.has(f.type));

  const deleteMutation = trpc.dataModels.forms.delete.useMutation({
    onSuccess: () => {
      toast.success(t("card.deleteSuccess"));
      utils.dataModels.forms.list.invalidate({ dataModelId });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(t("card.updateError") + ` (${e.message})`),
  });

  if (!enabled) return null;

  const forms = formsQuery.data ?? [];

  return (
    <>
      <PageSection
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            {t("createCta")}
          </Button>
        }
      >
        {formsQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : forms.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="space-y-4">
            {forms.map((form) => (
              <FormCard
                key={form.id}
                form={form}
                dataModelId={dataModelId}
                onDelete={() => setDeleteTarget({ id: form.id, name: form.name })}
              />
            ))}
          </div>
        )}
      </PageSection>

      <EngagementSection dataModelId={dataModelId} />

      <CreateFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        dataModelId={dataModelId}
        publicFields={publicFields}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("card.deleteTitle")}
        description={deleteTarget ? t("card.deleteDescription", { name: deleteTarget.name }) : ""}
        cancelLabel={t("card.deleteCancel")}
        confirmLabel={t("card.deleteConfirm")}
        onConfirm={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
        isPending={deleteMutation.isPending}
      />
    </>
  );
}

// Per-model engagement toggles (voting + discussions). Model-level features
// that surface on the public board ; grouped with sharing since that's where
// they show today.
function EngagementSection({ dataModelId }: { dataModelId: string }) {
  const t = useTranslations("admin.dataModels.editor.sharing.engagement");
  const utils = trpc.useUtils();
  const modelQuery = trpc.dataModels.models.getById.useQuery(
    { id: dataModelId },
    { refetchOnWindowFocus: false },
  );
  const update = trpc.dataModels.models.update.useMutation({
    onSuccess: () => utils.dataModels.models.getById.invalidate({ id: dataModelId }),
    onError: (e) => toast.error(e.message),
  });
  const model = modelQuery.data;

  return (
    <PageSection title={t("title")} subtitle={t("subtitle")}>
      {modelQuery.isLoading || !model ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          <label className="flex items-start justify-between gap-4 p-4">
            <span className="min-w-0">
              <span className="block text-sm font-medium">{t("voting.label")}</span>
              <span className="block text-xs text-muted-foreground">{t("voting.help")}</span>
            </span>
            <Switch
              checked={model.votingEnabled}
              disabled={update.isPending}
              onCheckedChange={(v) => update.mutate({ id: dataModelId, votingEnabled: v })}
            />
          </label>
          <label className="flex items-start justify-between gap-4 p-4">
            <span className="min-w-0">
              <span className="block text-sm font-medium">{t("discussions.label")}</span>
              <span className="block text-xs text-muted-foreground">{t("discussions.help")}</span>
            </span>
            <Switch
              checked={model.discussionsEnabled}
              disabled={update.isPending}
              onCheckedChange={(v) => update.mutate({ id: dataModelId, discussionsEnabled: v })}
            />
          </label>
        </div>
      )}
    </PageSection>
  );
}

type FormRow = {
  id: string;
  name: string;
  token: string;
  mode: "ANONYMOUS" | "EMAIL";
  fieldKeys: string[];
  active: boolean;
  listEnabled: boolean;
  listReadFieldKeys: string[];
  listPublicRead: boolean;
};

function FormCard({
  form,
  dataModelId,
  onDelete,
}: {
  form: FormRow;
  dataModelId: string;
  onDelete: () => void;
}) {
  const t = useTranslations("admin.dataModels.editor.sharing");
  const utils = trpc.useUtils();
  const [copied, setCopied] = useState(false);
  const link = `${origin()}/f/${form.token}`;

  const update = trpc.dataModels.forms.update.useMutation({
    onSuccess: () => utils.dataModels.forms.list.invalidate({ dataModelId }),
    onError: (e) => toast.error(t("card.updateError") + ` (${e.message})`),
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("card.copyError"));
    }
  };

  return (
    <div className="rounded-md border border-border p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{form.name}</span>
            <Badge variant={form.mode === "EMAIL" ? "secondary" : "outline"} size="sm">
              {form.mode === "EMAIL" ? t("badge.email") : t("badge.anonymous")}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {t("card.fieldsCount", { count: form.fieldKeys.length })}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor={`active-${form.id}`} className="text-xs text-muted-foreground">
              {t("card.activeLabel")}
            </Label>
            <Switch
              id={`active-${form.id}`}
              checked={form.active}
              onCheckedChange={(active) => update.mutate({ id: form.id, active })}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("card.delete")}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      {(form.mode === "ANONYMOUS" || form.listEnabled) && (
        <div className="flex items-center gap-2">
          <Input readOnly value={link} className="font-mono text-xs" />
          <Button type="button" variant="outline" size="sm" onClick={copy}>
            {copied ? (
              <Check className="mr-1.5 h-4 w-4" aria-hidden />
            ) : (
              <Copy className="mr-1.5 h-4 w-4" aria-hidden />
            )}
            {copied ? t("card.copied") : t("card.copy")}
          </Button>
        </div>
      )}

      {form.listEnabled && (
        <div className="mt-1">
          <Badge variant="outline" size="sm">
            {t("board.badge")}
          </Badge>
        </div>
      )}

      {form.mode === "EMAIL" && <InvitesManager formId={form.id} />}

      {form.listEnabled && <PendingQueue formId={form.id} />}
    </div>
  );
}

function PendingQueue({ formId }: { formId: string }) {
  const t = useTranslations("admin.dataModels.editor.sharing");
  const utils = trpc.useUtils();
  const pendingQuery = trpc.dataModels.forms.entries.pending.useQuery(
    { formId },
    { refetchOnWindowFocus: false },
  );
  const invalidate = () => utils.dataModels.forms.entries.pending.invalidate({ formId });
  const publish = trpc.dataModels.forms.entries.publish.useMutation({
    onSuccess: () => {
      toast.success(t("board.published"));
      invalidate();
    },
    onError: (e) => toast.error(t("card.updateError") + ` (${e.message})`),
  });
  const reject = trpc.dataModels.forms.entries.reject.useMutation({
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(t("card.updateError") + ` (${e.message})`),
  });

  const pending = pendingQuery.data ?? [];

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("board.pending", { count: pending.length })}
      </p>
      {pendingQuery.isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : pending.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("board.pendingEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {pending.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{e.title || "—"}</p>
                {e.submitterEmail && (
                  <p className="truncate text-xs text-muted-foreground">{e.submitterEmail}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={reject.isPending}
                  onClick={() => reject.mutate({ entryId: e.id })}
                >
                  {t("board.reject")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={publish.isPending}
                  onClick={() => publish.mutate({ entryId: e.id })}
                >
                  {t("board.approve")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InvitesManager({ formId }: { formId: string }) {
  const t = useTranslations("admin.dataModels.editor.sharing");
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");

  const invitesQuery = trpc.dataModels.forms.invites.list.useQuery(
    { formId },
    { refetchOnWindowFocus: false },
  );
  const add = trpc.dataModels.forms.invites.add.useMutation({
    onSuccess: () => {
      toast.success(t("invites.addSuccess"));
      setEmail("");
      utils.dataModels.forms.invites.list.invalidate({ formId });
    },
    onError: (e) => toast.error(t("invites.addError") + ` (${e.message})`),
  });
  const remove = trpc.dataModels.forms.invites.remove.useMutation({
    onSuccess: () => utils.dataModels.forms.invites.list.invalidate({ formId }),
    onError: (e) => toast.error(t("invites.addError") + ` (${e.message})`),
  });

  const invites = invitesQuery.data ?? [];

  return (
    <div className="mt-1 space-y-3">
      <div className="flex items-center gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("invites.emailPlaceholder")}
        />
        <Button
          type="button"
          size="sm"
          disabled={!email.trim() || add.isPending}
          onClick={() => add.mutate({ formId, email: email.trim(), appUrl: origin() })}
        >
          <Mail className="mr-1.5 h-4 w-4" aria-hidden />
          {t("invites.add")}
        </Button>
      </div>
      {invites.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("invites.empty")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {invites.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="truncate">{inv.email}</span>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={inv.submittedAt ? "success" : "outline"} size="sm">
                  {inv.submittedAt ? t("invites.submitted") : t("invites.pending")}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("invites.remove")}
                  onClick={() => remove.mutate({ id: inv.id })}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateFormDialog({
  open,
  onOpenChange,
  dataModelId,
  publicFields,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataModelId: string;
  publicFields: FormFieldRow[];
}) {
  const t = useTranslations("admin.dataModels.editor.sharing");
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"ANONYMOUS" | "EMAIL">("ANONYMOUS");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [intro, setIntro] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [boardEnabled, setBoardEnabled] = useState(false);
  const [boardPublicRead, setBoardPublicRead] = useState(true);
  const [readSelected, setReadSelected] = useState<Set<string>>(new Set());

  const reset = () => {
    setName("");
    setMode("ANONYMOUS");
    setSelected(new Set());
    setIntro("");
    setSuccessMessage("");
    setBoardEnabled(false);
    setBoardPublicRead(true);
    setReadSelected(new Set());
  };

  const create = trpc.dataModels.forms.create.useMutation({
    onSuccess: () => {
      toast.success(t("dialog.success"));
      utils.dataModels.forms.list.invalidate({ dataModelId });
      reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error(t("dialog.error") + ` (${e.message})`),
  });

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleRead = (key: string) =>
    setReadSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("dialog.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("dialog.title")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="form-name">{t("dialog.nameLabel")}</Label>
            <Input
              id="form-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("dialog.namePlaceholder")}
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("dialog.modeLabel")}</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as "ANONYMOUS" | "EMAIL")}>
              <label className="flex items-start gap-2 text-sm">
                <RadioGroupItem value="ANONYMOUS" id="mode-anon" className="mt-0.5" />
                <span>
                  <span className="font-medium">{t("dialog.modeAnonymous")}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t("dialog.modeAnonymousHint")}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <RadioGroupItem value="EMAIL" id="mode-email" className="mt-0.5" />
                <span>
                  <span className="font-medium">{t("dialog.modeEmail")}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t("dialog.modeEmailHint")}
                  </span>
                </span>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label>{t("dialog.fieldsLabel")}</Label>
            <p className="text-xs text-muted-foreground">{t("dialog.fieldsHint")}</p>
            {publicFields.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("dialog.noFields")}</p>
            ) : (
              <ul className="space-y-1.5 rounded-md border border-border p-3">
                {publicFields.map((f) => (
                  <li key={f.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`f-${f.id}`}
                      checked={selected.has(f.key)}
                      onChange={() => toggle(f.key)}
                    />
                    <Label htmlFor={`f-${f.id}`} className="text-sm font-normal">
                      {f.label}
                      {f.required && <span className="ml-1 text-destructive">*</span>}
                    </Label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="form-intro">{t("dialog.introLabel")}</Label>
            <Textarea
              id="form-intro"
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="form-success">{t("dialog.successLabel")}</Label>
            <Textarea
              id="form-success"
              value={successMessage}
              onChange={(e) => setSuccessMessage(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="board-enabled" className="font-medium">
                  {t("dialog.boardLabel")}
                </Label>
                <p className="text-xs text-muted-foreground">{t("dialog.boardHint")}</p>
              </div>
              <Switch id="board-enabled" checked={boardEnabled} onCheckedChange={setBoardEnabled} />
            </div>

            {boardEnabled && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm">{t("dialog.readAccessLabel")}</Label>
                  <RadioGroup
                    value={boardPublicRead ? "public" : "invited"}
                    onValueChange={(v) => setBoardPublicRead(v === "public")}
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="public" id="read-public" />
                      {t("dialog.readPublic")}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="invited" id="read-invited" />
                      {t("dialog.readInvited")}
                    </label>
                  </RadioGroup>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">{t("dialog.readFieldsLabel")}</Label>
                  <p className="text-xs text-muted-foreground">{t("dialog.readFieldsHint")}</p>
                  {publicFields.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("dialog.noFields")}</p>
                  ) : (
                    <ul className="space-y-1.5 rounded-md border border-border p-3">
                      {publicFields.map((f) => (
                        <li key={f.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`rf-${f.id}`}
                            checked={readSelected.has(f.key)}
                            onChange={() => toggleRead(f.key)}
                          />
                          <Label htmlFor={`rf-${f.id}`} className="text-sm font-normal">
                            {f.label}
                          </Label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("dialog.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!name.trim() || create.isPending}
            onClick={() =>
              create.mutate({
                dataModelId,
                name: name.trim(),
                mode,
                fieldKeys: [...selected],
                intro: intro.trim() || null,
                successMessage: successMessage.trim() || null,
                listEnabled: boardEnabled,
                listReadFieldKeys: boardEnabled ? [...readSelected] : [],
                listPublicRead: boardPublicRead,
              })
            }
          >
            {t("dialog.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
