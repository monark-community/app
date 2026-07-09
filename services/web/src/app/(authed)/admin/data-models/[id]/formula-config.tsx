"use client";

import { useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, FunctionSquare, Plus } from "lucide-react";
import { extractFieldRefs, FormulaError, FORMULA_FUNCTIONS } from "@monark/data-models/contracts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type FormulaResultTypeValue = "TEXT" | "NUMBER" | "BOOLEAN" | "DATE";
const RESULT_TYPES: FormulaResultTypeValue[] = ["NUMBER", "TEXT", "BOOLEAN", "DATE"];

/** A sibling field the formula can reference (its stable key + display label). */
export interface FormulaColumn {
  key: string;
  label: string;
}

/**
 * The FORMULA field config editor : a result-type picker plus a popover
 * expression editor with column insertion, a live syntax/reference validity
 * check (via the shared `@monark/data-models` engine — the same one that
 * evaluates on write), and a function reference. Purely controlled ; the
 * parent (field-editor-dialog) owns the `expression` / `resultType` state and
 * assembles them into the field config.
 */
export function FormulaConfigEditor({
  expression,
  onExpressionChange,
  resultType,
  onResultTypeChange,
  columns,
}: {
  expression: string;
  onExpressionChange: (value: string) => void;
  resultType: FormulaResultTypeValue;
  onResultTypeChange: (value: FormulaResultTypeValue) => void;
  columns: FormulaColumn[];
}) {
  const t = useTranslations("admin.dataModels.editor.fieldDialog.config.formula");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Live validity : parse the expression, then confirm every referenced
  // identifier is a known sibling column. `extractFieldRefs` throws on a
  // syntax error or unknown function, which surfaces as the error message.
  const validation = useMemo(() => {
    const trimmed = expression.trim();
    if (trimmed === "") return { state: "empty" as const };
    try {
      const refs = extractFieldRefs(trimmed);
      const known = new Set(columns.map((c) => c.key));
      const unknown = refs.filter((r) => !known.has(r));
      if (unknown.length > 0) {
        return {
          state: "error" as const,
          message: t("unknownField", { field: unknown.join(", ") }),
        };
      }
      return { state: "ok" as const, refs };
    } catch (err) {
      return {
        state: "error" as const,
        message: err instanceof FormulaError ? err.message : t("invalid"),
      };
    }
  }, [expression, columns, t]);

  function insertAtCursor(text: string) {
    const el = textareaRef.current;
    if (!el) {
      onExpressionChange(expression + text);
      return;
    }
    const start = el.selectionStart ?? expression.length;
    const end = el.selectionEnd ?? expression.length;
    const next = expression.slice(0, start) + text + expression.slice(end);
    onExpressionChange(next);
    // Restore focus + place the caret just after the inserted text.
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + text.length;
      el.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>{t("resultType")}</Label>
        <Select
          value={resultType}
          onValueChange={(v) => onResultTypeChange(v as FormulaResultTypeValue)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESULT_TYPES.map((rt) => (
              <SelectItem key={rt} value={rt}>
                {t(`resultTypes.${rt}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>{t("expression")}</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={cn(
                "h-auto min-h-9 w-full justify-start whitespace-normal py-2 text-left font-mono text-xs",
                expression.trim() === "" && "font-sans text-muted-foreground",
              )}
            >
              <FunctionSquare className="mr-2 h-4 w-4 shrink-0" aria-hidden />
              <span className="break-all">{expression.trim() || t("addFormula")}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[26rem] max-w-[calc(100vw-2rem)] space-y-2 p-3"
          >
            <Textarea
              ref={textareaRef}
              value={expression}
              onChange={(e) => onExpressionChange(e.target.value)}
              placeholder={t("expressionPlaceholder")}
              rows={3}
              className="font-mono text-xs"
              spellCheck={false}
            />

            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" disabled={columns.length === 0}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    {t("insertColumn")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                  {columns.length === 0 ? (
                    <DropdownMenuItem disabled>{t("noColumns")}</DropdownMenuItem>
                  ) : (
                    columns.map((c) => (
                      <DropdownMenuItem key={c.key} onSelect={() => insertAtCursor(c.key)}>
                        <span className="mr-2">{c.label}</span>
                        <code className="ml-auto text-xs text-muted-foreground">{c.key}</code>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {validation.state === "ok" ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  {t("valid")}
                </span>
              ) : validation.state === "error" ? (
                <span className="inline-flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                  {validation.message}
                </span>
              ) : null}
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                {t("functions")}
              </summary>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {FORMULA_FUNCTIONS.map((fn) => (
                  <Badge
                    key={fn}
                    variant="secondary"
                    size="sm"
                    className="cursor-pointer font-mono"
                    onClick={() => insertAtCursor(`${fn}()`)}
                  >
                    {fn}
                  </Badge>
                ))}
              </div>
            </details>

            <p className="text-xs text-muted-foreground">{t("help")}</p>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
