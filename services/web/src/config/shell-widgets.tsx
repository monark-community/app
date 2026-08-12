"use client";

import type { ComponentType } from "react";
import { trpc } from "@/lib/trpc";
import { AchievementsMenuWidget } from "@/components/achievements/achievements-menu-widget";

/**
 * Shell widget slots — the web analogue of {@link file://./primary-nav.ts PRIMARY_NAV}
 * for *rendered* module visuals rather than nav links. A slot is a named region of
 * the app shell (today: the account menu's card area) that modules — including
 * extended, non-core ones — can drop a component into, without each host surface
 * hand-importing every module.
 *
 * Same grain as the rest of the web-side "registries" : a single, ordered,
 * diff-readable config array, each entry optionally gated by a feature flag. It is
 * NOT a runtime `register()` — a client registry would need the host to import each
 * module's side-effect anyway, so we keep the composition explicit here. A widget's
 * *component* still lives with its module concern (the wired card fetches its own
 * data via tRPC, mirroring how the kanban board view lives in web) ; this file only
 * declares WHERE and WHEN it renders.
 *
 * To add a widget : ship the component, add one entry below (slot + order + span +
 * optional flag), done. To add a new slot : extend {@link ShellWidgetSlot} and have
 * the host surface call {@link useShellWidgets}.
 */
export type ShellWidgetSlot = "account-menu";

/** Props every shell widget receives. `onNavigate` lets a widget close the shell
 *  surface (e.g. the account-menu sheet) when it routes away. */
export type ShellWidgetProps = { onNavigate?: () => void };

export type ShellWidget = {
  slot: ShellWidgetSlot;
  /** Stable id (React key + de-dup). */
  id: string;
  /** Feature-flag key ; the widget renders only when it resolves explicitly `true`
   *  (so a default-off module never flashes in before its flag loads). */
  flag?: string;
  /** Ascending sort within the slot. */
  order: number;
  /** Column span in the slot's 2-column grid. */
  span: 1 | 2;
  Component: ComponentType<ShellWidgetProps>;
};

export const SHELL_WIDGETS: ShellWidget[] = [
  {
    slot: "account-menu",
    id: "achievements",
    flag: "achievements.enabled",
    order: 10,
    span: 2,
    Component: AchievementsMenuWidget,
  },
];

/**
 * Resolve the widgets for a slot, flag-gated + ordered. Reads the same session
 * flag map the primary nav uses (cached app-wide). A flagged widget shows only
 * when its flag is explicitly `true` — default-off modules stay hidden until then.
 */
export function useShellWidgets(slot: ShellWidgetSlot): ShellWidget[] {
  const flags =
    trpc.featureFlags.getAllForSession.useQuery(undefined, {
      refetchOnWindowFocus: false,
      staleTime: Infinity,
    }).data ?? {};
  return SHELL_WIDGETS.filter((w) => w.slot === slot)
    .filter((w) => !w.flag || flags[w.flag] === true)
    .sort((a, b) => a.order - b.order);
}
