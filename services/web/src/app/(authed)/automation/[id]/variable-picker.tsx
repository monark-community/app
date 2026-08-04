"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { VariableSuggestion } from "@monark/components/ui/variable-input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";

/**
 * Tap-to-open variable picker for a config field. Sources (Trigger / each
 * connected step / Workflow variables) are the first level ; tapping one drills
 * into its variables. A search box flattens across everything. Renders as a
 * popover under the field on desktop and a bottom sheet on mobile — so it's
 * always fully visible above the keyboard, which the inline `{{` menu was not.
 *
 * The available set is passed as {@link VariableSuggestion}[] (the same list the
 * inline autocomplete uses) ; the picker regroups it by `group`. `onPick` gets
 * the chosen token (`"{{ steps.find.id }}"`).
 */
type PickerGroup = { id: string; title: string; items: VariableSuggestion[] };

function groupSuggestions(suggestions: VariableSuggestion[]): PickerGroup[] {
  const out: PickerGroup[] = [];
  const byId = new Map<string, PickerGroup>();
  for (const s of suggestions) {
    const id = s.group ?? "";
    let group = byId.get(id);
    if (!group) {
      group = { id, title: s.group ?? "", items: [] };
      byId.set(id, group);
      out.push(group);
    }
    group.items.push(s);
  }
  return out;
}

export function VariablePicker({
  suggestions,
  onPick,
  triggerClassName,
  disabled = false,
  ariaLabel,
  children,
}: {
  suggestions: VariableSuggestion[];
  onPick: (token: string) => void;
  /** Class for the trigger button (the field looks). */
  triggerClassName?: string;
  disabled?: boolean;
  /** Accessible label for the trigger (e.g. an icon-only `{ }` button). */
  ariaLabel?: string;
  /** Trigger content — the current value's chip, a placeholder, or a `{ }` icon. */
  children: ReactNode;
}) {
  const t = useTranslations("automation.editor");
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const groups = useMemo(() => groupSuggestions(suggestions), [suggestions]);

  const reset = () => {
    setActiveGroup(null);
    setQuery("");
  };
  const change = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };
  const pick = (token: string) => {
    onPick(token);
    change(false);
  };

  const q = query.trim().toLowerCase();
  const flat = q
    ? suggestions.filter((s) => `${s.group ?? ""} ${s.label} ${s.token}`.toLowerCase().includes(q))
    : [];
  const current = activeGroup ? groups.find((g) => g.id === activeGroup) : null;

  const body =
    suggestions.length === 0 ? (
      <p className="p-4 text-sm text-muted-foreground">{t("noVariablesAvailable")}</p>
    ) : (
      <Command shouldFilter={false} className="max-h-[70dvh]">
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={t("variableSearch")}
          autoFocus={!isMobile}
        />
        <CommandList className="max-h-[60dvh]">
          <CommandEmpty>{t("noVariablesMatch")}</CommandEmpty>
          {q ? (
            // Flat search across every source, plus an escape hatch to use the
            // typed text verbatim (a deep path the declared outputs don't list).
            <CommandGroup>
              {flat.map((s) => (
                <CommandItem key={s.token} value={s.token} onSelect={() => pick(s.token)}>
                  <span className="truncate">{s.label}</span>
                  {s.group ? (
                    <span className="ml-auto shrink-0 pl-2 text-[11px] text-muted-foreground">
                      {s.group}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
              <CommandItem
                key="__custom__"
                value={`__custom__:${query}`}
                className="text-muted-foreground"
                onSelect={() => pick(`{{ ${query.trim()} }}`)}
              >
                {t("useCustomVariable", { ref: `{{ ${query.trim()} }}` })}
              </CommandItem>
            </CommandGroup>
          ) : current ? (
            // Level 2 : one source's variables, with a back row.
            <>
              <CommandItem
                value="__back__"
                onSelect={() => setActiveGroup(null)}
                className="text-muted-foreground"
              >
                <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
                {current.title}
              </CommandItem>
              <CommandGroup>
                {current.items.map((s) => (
                  <CommandItem key={s.token} value={s.token} onSelect={() => pick(s.token)}>
                    <span className="truncate">{s.label}</span>
                    {s.hint ? (
                      <span className="ml-auto shrink-0 pl-2 text-[11px] text-muted-foreground">
                        {s.hint}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : (
            // Level 1 : the sources.
            <CommandGroup>
              {groups.map((g) => (
                <CommandItem key={g.id} value={g.id} onSelect={() => setActiveGroup(g.id)}>
                  <span className="truncate">{g.title}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-1 pl-2 text-[11px] text-muted-foreground">
                    {g.items.length}
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    );

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          className={triggerClassName}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          {children}
        </button>
        <Sheet open={open} onOpenChange={change}>
          <SheetContent
            side="bottom"
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="max-h-[85dvh] rounded-t-xl p-0"
          >
            <SheetHeader className="p-4 pb-1 text-left">
              <SheetTitle>{t("variablePickerTitle")}</SheetTitle>
            </SheetHeader>
            {body}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={change}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(triggerClassName)}
          aria-haspopup="dialog"
          aria-label={ariaLabel}
          disabled={disabled}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,90vw)] p-0">
        {body}
      </PopoverContent>
    </Popover>
  );
}
