"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { GroupedMultiSelect, type GroupedMultiSelectGroup } from "@/components/patterns";
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

  // Types covered by an active prefix subscription — folded into `isChecked`
  // so the shared selector shows every event in a prefixed module as checked
  // (and the module header as "all") without needing to know about prefixes.
  const prefixCoveredTypes = useMemo(() => {
    const set = new Set<string>();
    for (const group of eventTypes.data?.groups ?? []) {
      const prefix = commonDottedPrefix(group.events.map((e) => e.type));
      if (prefix !== null && prefixSet.has(prefix)) {
        for (const ev of group.events) set.add(ev.type);
      }
    }
    return set;
  }, [eventTypes.data, prefixSet]);

  // One group per module for the shared grouped selector (module names
  // render mono). The selector owns search + expand ; pass the full list.
  const groups = useMemo<GroupedMultiSelectGroup[]>(
    () =>
      (eventTypes.data?.groups ?? []).map((g) => ({
        key: g.module,
        label: g.module,
        monoLabel: true,
        items: g.events.map((e) => ({
          value: e.type,
          primary: e.type,
          secondary: e.description,
        })),
      })),
    [eventTypes.data],
  );

  function toggleEventInGroup(types: string[], type: string, on: boolean) {
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

  function toggleAllInGroup(types: string[], next: boolean) {
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

      <GroupedMultiSelect
        groups={groups}
        isChecked={(type) => exactSet.has(type) || prefixCoveredTypes.has(type)}
        onToggleItem={(group, type, next) =>
          toggleEventInGroup(
            group.items.map((i) => i.value),
            type,
            next,
          )
        }
        onToggleGroup={(group, selectAll) =>
          toggleAllInGroup(
            group.items.map((i) => i.value),
            selectAll,
          )
        }
        renderEmpty={(query) => (query !== "" ? t("emptySearch", { query }) : t("registryEmpty"))}
        labels={{
          searchPlaceholder: t("searchPlaceholder"),
          searchAria: t("searchAria"),
          toggleAllAria: (module) => t("moduleToggleAriaAll", { module }),
        }}
      />
    </div>
  );
}
