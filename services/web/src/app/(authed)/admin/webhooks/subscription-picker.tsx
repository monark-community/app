"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

export type SubscriptionDraft = {
  localId: string;
  eventType: string;
  isPrefix: boolean;
};

export type SubscriptionPickerProps = {
  subscriptions: SubscriptionDraft[];
  onChange: (next: SubscriptionDraft[]) => void;
};

function nextLocalId(): string {
  return `s_${Math.random().toString(36).slice(2)}`;
}

/**
 * Returns the longest dotted-segment prefix shared by every event
 * type in `eventTypes`, or `null` if there is no common prefix that
 * cleanly ends on a dot. Used by the tri-state "all" toggle to write
 * a single prefix subscription when the module's events share a
 * naming convention (e.g. `rbac.role-assigned` + `rbac.role-revoked`
 * share the `rbac.` prefix), and to fall back to N exact
 * subscriptions when they don't (e.g. the auth module's events span
 * `user.`, `trusted-device.`, and `totp.` prefixes).
 */
function commonDottedPrefix(eventTypes: string[]): string | null {
  if (eventTypes.length === 0) return null;
  const first = eventTypes[0];
  if (first === undefined) return null;
  const dotIdx = first.indexOf(".");
  if (dotIdx <= 0) return null;
  const prefix = first.slice(0, dotIdx + 1);
  for (const t of eventTypes) {
    if (!t.startsWith(prefix)) return null;
  }
  return prefix;
}

/**
 * Categorized event-type picker. Mirrors the RBAC role-editor's
 * permission expansion panel shape : one bordered container, one
 * Collapsible per module with a tri-state header checkbox + a
 * `selected/total` count chip, individual event rows inside the
 * panel as bordered labels with mono key + description.
 *
 * The "all events in module" tri-state writes either a single prefix
 * subscription (when every event in the group shares a common dotted
 * prefix) or N exact subscriptions (when they don't — e.g. the auth
 * module's events span `user.`, `trusted-device.`, and `totp.`
 * prefixes). Operators don't need to know which path the picker
 * takes ; the server-side routing treats both kinds uniformly.
 *
 * Subscriptions whose event type isn't in the registered set surface
 * at the top as a "Custom subscriptions" chip strip with a remove
 * affordance per chip — usually leftovers from an older deploy where
 * a module hadn't yet shipped its event-type registration.
 */
export function SubscriptionPicker({ subscriptions, onChange }: SubscriptionPickerProps) {
  const t = useTranslations("admin.webhooks.editor.picker");
  const [search, setSearch] = useState("");
  const [openModules, setOpenModules] = useState<Set<string>>(new Set());
  const eventTypes = trpc.webhooks.listEventTypes.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  // Index the current draft so the picker reads in O(1) :
  // `exactSet` is every individual type the operator picked ;
  // `prefixSet` is every prefix subscription. The picker rebuilds
  // both shapes on every change so it stays the source of truth.
  const exactSet = useMemo(() => {
    const set = new Set<string>();
    for (const s of subscriptions) {
      if (!s.isPrefix && s.eventType.trim() !== "") set.add(s.eventType.trim());
    }
    return set;
  }, [subscriptions]);
  const prefixSet = useMemo(() => {
    const set = new Set<string>();
    for (const s of subscriptions) {
      if (s.isPrefix && s.eventType.trim() !== "") set.add(s.eventType.trim());
    }
    return set;
  }, [subscriptions]);

  // The set of every event type known to the registry. Anything in
  // the draft that's missing from this set lands in the "custom"
  // strip ; same for prefix subscriptions whose prefix doesn't match
  // the longest-common-prefix of any module group.
  const knownTypes = useMemo(() => {
    const set = new Set<string>();
    for (const group of eventTypes.data?.groups ?? []) {
      for (const ev of group.events) set.add(ev.type);
    }
    return set;
  }, [eventTypes.data]);

  const knownPrefixes = useMemo(() => {
    const set = new Set<string>();
    for (const group of eventTypes.data?.groups ?? []) {
      const prefix = commonDottedPrefix(group.events.map((e) => e.type));
      if (prefix !== null) set.add(prefix);
    }
    return set;
  }, [eventTypes.data]);

  const customDrafts = useMemo(() => {
    if (eventTypes.isLoading) return [];
    return subscriptions.filter((s) => {
      const trimmed = s.eventType.trim();
      if (trimmed === "") return false;
      if (s.isPrefix) return !knownPrefixes.has(trimmed);
      return !knownTypes.has(trimmed);
    });
  }, [subscriptions, knownPrefixes, knownTypes, eventTypes.isLoading]);

  const trimmedSearch = search.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!eventTypes.data) return [];
    if (trimmedSearch === "") return eventTypes.data.groups;
    return eventTypes.data.groups
      .map((g) => ({
        module: g.module,
        events: g.events.filter(
          (e) =>
            e.type.toLowerCase().includes(trimmedSearch) ||
            e.description.toLowerCase().includes(trimmedSearch),
        ),
      }))
      .filter((g) => g.events.length > 0);
  }, [eventTypes.data, trimmedSearch]);

  // Auto-expand every group with hits while a search is active.
  // Tracks the previous needle so an operator who manually collapses
  // a group after expanding doesn't get clobbered on the next
  // keystroke.
  const previousNeedle = useRef("");
  useEffect(() => {
    if (trimmedSearch === previousNeedle.current) return;
    previousNeedle.current = trimmedSearch;
    if (trimmedSearch === "") return;
    setOpenModules(new Set(filteredGroups.map((g) => g.module)));
  }, [trimmedSearch, filteredGroups]);

  function toggleModuleOpen(module: string, open: boolean) {
    setOpenModules((current) => {
      const out = new Set(current);
      if (open) out.add(module);
      else out.delete(module);
      return out;
    });
  }

  function toggleEventInGroup(
    group: { events: Array<{ type: string }> },
    type: string,
    on: boolean,
  ) {
    const types = group.events.map((e) => e.type);
    const prefix = commonDottedPrefix(types);
    const prefixActive = prefix !== null && prefixSet.has(prefix);

    // Prefix-on : the event currently appears checked because the
    // module's prefix subscription covers it. Toggling a single sub
    // off needs to fan the prefix out into N-1 exact subs (every
    // event in the module except the one being unchecked) so the
    // operator's intent is preserved without forcing them to drop the
    // whole module first.
    if (prefixActive) {
      if (on) return; // every event is already covered by the prefix
      const cleared = subscriptions.filter((s) => {
        if (s.isPrefix) {
          return prefix === null || s.eventType.trim() !== prefix;
        }
        return true;
      });
      const additions = types
        .filter((t) => t !== type)
        .map((t) => ({
          localId: nextLocalId(),
          eventType: t,
          isPrefix: false,
        }));
      onChange([...cleared, ...additions]);
      return;
    }

    if (on) {
      if (exactSet.has(type)) return;
      onChange([...subscriptions, { localId: nextLocalId(), eventType: type, isPrefix: false }]);
    } else {
      onChange(subscriptions.filter((s) => !(s.eventType === type && s.isPrefix === false)));
    }
  }

  function toggleAllInGroup(
    group: { module: string; events: Array<{ type: string }> },
    next: boolean,
  ) {
    const types = group.events.map((e) => e.type);
    const prefix = commonDottedPrefix(types);
    const groupTypeSet = new Set(types);

    if (!next) {
      // Clear every exact + prefix sub the picker had set for this
      // group. Custom drafts elsewhere stay untouched.
      onChange(
        subscriptions.filter((s) => {
          const trimmed = s.eventType.trim();
          if (s.isPrefix) {
            return prefix === null || trimmed !== prefix;
          }
          return !groupTypeSet.has(trimmed);
        }),
      );
      return;
    }

    // Turning on : drop any pre-existing exact subs in the group
    // (the prefix or new full set replaces them) + push the chosen
    // representation.
    const cleared = subscriptions.filter((s) => {
      const trimmed = s.eventType.trim();
      if (s.isPrefix) return true;
      return !groupTypeSet.has(trimmed);
    });
    if (prefix !== null) {
      if (cleared.some((s) => s.isPrefix && s.eventType.trim() === prefix)) {
        onChange(cleared);
        return;
      }
      onChange([...cleared, { localId: nextLocalId(), eventType: prefix, isPrefix: true }]);
      return;
    }
    const additions = types.map((type) => ({
      localId: nextLocalId(),
      eventType: type,
      isPrefix: false,
    }));
    onChange([...cleared, ...additions]);
  }

  function removeSubscription(localId: string) {
    onChange(subscriptions.filter((s) => s.localId !== localId));
  }

  if (eventTypes.isLoading) {
    return <Skeleton className="h-32 w-full rounded-md" />;
  }

  return (
    <div className="space-y-3">
      {customDrafts.length > 0 && (
        <div className="space-y-2 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-xs text-amber-900 dark:text-amber-200">{t("customSectionTitle")}</p>
          <ul className="flex flex-wrap gap-2">
            {customDrafts.map((sub) => (
              <li
                key={sub.localId}
                className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-[11px]"
              >
                <code className="font-mono">
                  {sub.isPrefix ? `${sub.eventType}*` : sub.eventType}
                </code>
                <button
                  type="button"
                  onClick={() => removeSubscription(sub.localId)}
                  aria-label={t("customRemoveAria", {
                    type: sub.eventType,
                  })}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchAria")}
          className="pl-8"
        />
      </div>

      <div className="space-y-2 rounded-md border border-border p-2">
        {filteredGroups.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            {trimmedSearch !== "" ? t("emptySearch", { query: search.trim() }) : t("registryEmpty")}
          </p>
        ) : (
          filteredGroups.map((group) => {
            const prefix = commonDottedPrefix(group.events.map((e) => e.type));
            const prefixOn = prefix !== null && prefixSet.has(prefix);
            return (
              <ModuleSection
                key={group.module}
                module={group.module}
                events={group.events}
                exactSet={exactSet}
                prefixOn={prefixOn}
                open={openModules.has(group.module)}
                onOpenChange={(next) => toggleModuleOpen(group.module, next)}
                onToggleAll={(next) => toggleAllInGroup(group, next)}
                onToggleExact={(type, next) => toggleEventInGroup(group, type, next)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function ModuleSection({
  module,
  events,
  exactSet,
  prefixOn,
  open,
  onOpenChange,
  onToggleAll,
  onToggleExact,
}: {
  module: string;
  events: Array<{ type: string; description: string }>;
  exactSet: Set<string>;
  prefixOn: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleAll: (next: boolean) => void;
  onToggleExact: (type: string, next: boolean) => void;
}) {
  const t = useTranslations("admin.webhooks.editor.picker");
  const total = events.length;
  const selectedCount = prefixOn
    ? total
    : events.reduce((acc, ev) => acc + (exactSet.has(ev.type) ? 1 : 0), 0);
  const state: "none" | "some" | "all" =
    selectedCount === 0 ? "none" : selectedCount === total ? "all" : "some";

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40">
        <Checkbox
          checked={state === "all"}
          indeterminate={state === "some"}
          onChange={(event) => onToggleAll(event.target.checked)}
          aria-label={t("moduleToggleAriaAll", { module })}
          onClick={(event) => event.stopPropagation()}
        />
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex flex-1 items-center justify-between gap-2 rounded-sm text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium">
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              )}
              <span className="font-mono">{module}</span>
            </span>
            <Badge
              variant={state === "all" ? "primary" : "secondary"}
              size="sm"
              className="shrink-0"
            >
              {t("moduleSelectionCount", {
                selected: selectedCount,
                total,
              })}
            </Badge>
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <ul className="space-y-1 px-2 pb-1 pt-1">
          {events.map((ev) => {
            const checked = exactSet.has(ev.type) || prefixOn;
            return (
              <li key={ev.type}>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <Checkbox
                    checked={checked}
                    onChange={(event) => onToggleExact(ev.type, event.target.checked)}
                    aria-label={ev.type}
                  />
                  <span className="flex-1 space-y-0.5">
                    <span className="block font-mono text-xs">{ev.type}</span>
                    <span className="block text-xs text-muted-foreground">{ev.description}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
