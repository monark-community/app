/**
 * Runtime registry of every domain event the api emits, keyed by
 * event type. Each entry carries a short operator-facing description
 * + the module that owns it. The webhook admin UI reads this through
 * `webhooks.listEventTypes` to render a guided subscription picker
 * — operators check boxes against known events instead of guessing
 * type strings.
 *
 * The registry is **separate** from the `DomainEvent` type union
 * (codegen'd from per-module `XxxEvents` types). The union is purely
 * compile-time ; this is the runtime list. They stay aligned by
 * convention : every event type a module emits in `contracts/events.ts`
 * should also be registered here through that module's
 * `register<Module>EventTypes()` helper.
 *
 * Mirror of the registerFlags / registerPermissions / registerNotificationKind
 * pattern so extending a non-core module's events is a one-call
 * boot-time addition with no schema or core changes.
 */

export type EventTypeDescriptor = {
  /** Wire-level event type, e.g. `"rbac.role-assigned"`. */
  type: string;
  /** Module that registered this event (the package that emits it). */
  module: string;
  /** Operator-facing description. Surfaces in the webhook picker. */
  description: string;
  /**
   * When true, this event type is org-scoped content (e.g. a per-Data-Model
   * record event). It's globally registered so the picker has its metadata,
   * but only SHOWN to an org a registered visibility resolver reports it
   * visible for — so one org's model keys don't surface in another's picker.
   */
  orgScoped?: boolean;
};

const registry = new Map<string, EventTypeDescriptor>();

const TYPE_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export function registerEventTypes(
  module: string,
  types: Record<string, { description: string; orgScoped?: boolean }>,
): void {
  for (const [type, def] of Object.entries(types)) {
    if (!TYPE_RE.test(type)) {
      throw new Error(`Invalid event type : "${type}"`);
    }
    registry.set(type, { type, module, description: def.description, orgScoped: def.orgScoped });
  }
}

// ── Org-scoped event-type visibility ─────────────────────────────────
// Resolvers report which `orgScoped` event types are visible to a given org
// in the webhook subscription picker. Keeps this registry (and @monark/webhooks)
// ignorant of the modules that own org-scoped events (e.g. @monark/data-models,
// whose per-model event types depend on that org's live models) — they push a
// resolver at boot rather than being imported here.

export type OrgScopedEventTypeResolver = (
  organizationId: string,
) => Promise<Iterable<string>> | Iterable<string>;

const orgScopedResolvers: OrgScopedEventTypeResolver[] = [];

export function registerOrgScopedEventTypeVisibility(resolver: OrgScopedEventTypeResolver): void {
  orgScopedResolvers.push(resolver);
}

// Union of every resolver's visible types for this org. Empty for a null org,
// which hides all `orgScoped` event types rather than leaking them.
export async function orgVisibleEventTypes(organizationId: string | null): Promise<Set<string>> {
  const visible = new Set<string>();
  if (organizationId === null) return visible;
  for (const resolve of orgScopedResolvers) {
    for (const type of await resolve(organizationId)) visible.add(type);
  }
  return visible;
}

export function getEventTypeDescriptor(type: string): EventTypeDescriptor | undefined {
  return registry.get(type);
}

export function listEventTypes(): EventTypeDescriptor[] {
  const out = [...registry.values()];
  out.sort((a, b) => a.type.localeCompare(b.type));
  return out;
}

export function listEventTypesByModule(): Array<{
  module: string;
  events: EventTypeDescriptor[];
}> {
  const grouped = new Map<string, EventTypeDescriptor[]>();
  for (const desc of registry.values()) {
    const bucket = grouped.get(desc.module) ?? [];
    bucket.push(desc);
    grouped.set(desc.module, bucket);
  }
  const out: Array<{ module: string; events: EventTypeDescriptor[] }> = [];
  for (const [module, events] of grouped) {
    events.sort((a, b) => a.type.localeCompare(b.type));
    out.push({ module, events });
  }
  out.sort((a, b) => a.module.localeCompare(b.module));
  return out;
}

export function _resetEventRegistryForTesting(): void {
  registry.clear();
  orgScopedResolvers.length = 0;
}
