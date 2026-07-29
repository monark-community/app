import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/**
 * One labelled form field whose label sits **above** the control when space is
 * tight and moves to the **left** (a 2-column row) once the surrounding form is
 * wide enough. The switch is driven by a container query (`@md`, so the flip
 * engages at ~448px of container width), so it responds to the form's own width
 * (e.g. a resized detail panel) rather than the viewport — and every field in
 * the same `@container` flips together, keeping one consistent layout across the
 * form (never a per-field mix). `@md` is deliberately below the app's narrowest
 * desktop detail panel (`sm:max-w-lg`, ~464px content-box after the panel's
 * px-6) so label-left actually engages in a side panel, while a mobile
 * full-screen panel (well under 448px) still stacks. The label column is a fixed
 * width so the controls align.
 *
 * Wrap the form (or its field group) in `@container` and drop the control +
 * any help / error text in as `children`.
 */
export function FieldRow({
  label,
  htmlFor,
  icon: Icon,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  /** Optional field-type glyph shown before the label (e.g. from `FIELD_TYPE_ICON`). */
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 @md:grid @md:grid-cols-[10rem_minmax(0,1fr)] @md:items-start @md:gap-x-4",
        className,
      )}
    >
      <Label htmlFor={htmlFor} className="flex items-center gap-1.5 @md:pt-2">
        {Icon ? (
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
        ) : null}
        {label}
      </Label>
      <div className="min-w-0 space-y-1.5">{children}</div>
    </div>
  );
}
