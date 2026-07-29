"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ComponentProps, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useForm, type FieldValues } from "react-hook-form";
import { ConfirmDialog, FormActionsFooter } from "@/components/patterns";
import { Form } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { FieldInput } from "./registry";
import { schemaForFields } from "./schema";
import { useFieldStrings } from "./strings";
import { defaultValueFor, type FieldDef } from "./types";

/** Copy for the delete-confirmation dialog (omit to hide delete). */
type DeleteConfig = Pick<
  ComponentProps<typeof ConfirmDialog>,
  "title" | "description" | "cancelLabel" | "confirmLabel" | "isPending"
> & { deleteLabel: string; onDelete: () => void };

export interface AutoFormProps {
  /** Ordered field descriptors that drive the form. */
  fields: FieldDef[];
  /** Initial values, overlaid on each field's empty default (edit mode). */
  defaultValues?: Record<string, unknown>;
  /** Receives the validated values on submit. */
  onSubmit: (values: FieldValues) => void | Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  cancelLabel: string;
  /** Disables the footer while a mutation is in flight. */
  isBusy?: boolean;
  /** When set, a destructive delete action + confirm dialog is rendered. */
  deleteConfig?: DeleteConfig;
  /** Rendered above the fields (e.g. a title header). */
  header?: ReactNode;
  /** Custom controls rendered after the auto fields, before the footer. */
  children?: ReactNode;
  className?: string;
}

/**
 * A schema-driven create/edit form. Give it {@link FieldDef}s and it
 * builds the zod resolver (from the registry), renders each field, and
 * wires the shared {@link FormActionsFooter} + {@link ConfirmDialog}.
 * Localized field chrome comes from `useFieldStrings`, so callers only
 * pass already-translated `label` / `description` on each field def.
 */
export function AutoForm({
  fields,
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel,
  cancelLabel,
  isBusy = false,
  deleteConfig,
  header,
  children,
  className,
}: AutoFormProps) {
  const { labels, messages } = useFieldStrings();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const schema = useMemo(() => schemaForFields(fields, messages), [fields, messages]);

  const resolvedDefaults = useMemo(() => {
    const base: Record<string, unknown> = {};
    for (const f of fields) base[f.name] = defaultValueFor(f);
    return { ...base, ...(defaultValues ?? {}) };
  }, [fields, defaultValues]);

  const form = useForm<FieldValues>({
    resolver: zodResolver(schema),
    defaultValues: resolvedDefaults,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className={cn("space-y-6", className)}>
        {header}
        {/*
          `@container` scopes the fields' responsive label-left flip (see
          FieldShell) to the form's own width, so it flips inside a wide detail
          panel or a full page but stacks in a narrow / mobile panel — matching
          the hand-rolled FieldRow forms.
        */}
        <div className="@container space-y-5">
          {fields.map((def) => (
            <FieldInput key={def.name} def={def} labels={labels} />
          ))}
        </div>
        {children}
        <FormActionsFooter
          submitLabel={submitLabel}
          cancelLabel={cancelLabel}
          onCancel={onCancel}
          isBusy={isBusy}
          onDelete={deleteConfig ? () => setConfirmOpen(true) : undefined}
          deleteLabel={deleteConfig?.deleteLabel}
        />
      </form>
      {deleteConfig ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={deleteConfig.title}
          description={deleteConfig.description}
          cancelLabel={deleteConfig.cancelLabel}
          confirmLabel={deleteConfig.confirmLabel}
          isPending={deleteConfig.isPending}
          onConfirm={deleteConfig.onDelete}
        />
      ) : null}
    </Form>
  );
}
