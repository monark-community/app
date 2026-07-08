import { registerEventTypes, registerOrgScopedEventTypeVisibility } from "@monark/common";
import { registerOrgScopedPermissionVisibility, registerPermissions } from "@monark/rbac/server";
import { listAllDataModelsForRegistration, listLiveDataModelsForOrg } from "./data";

/**
 * Per-model integration into RBAC + the event-type registry (and, through
 * it, the webhooks subscription picker). Every Data Model, as it is created
 * / renamed, auto-registers:
 *
 *   - three record permissions — `data-models.<key>-record-{read,write,delete}`
 *     — so a role can be granted access to ONE model's records without the
 *     blanket `data-models.record-*`. `requireModelAccess` in the router
 *     accepts either the per-model key OR the generic one (admins still
 *     short-circuit), so this is purely additive.
 *   - three event types — `data-models.<key>-record-{created,updated,deleted}`
 *     — so an operator can subscribe a webhook to a single model's records.
 *     The engine still EMITS the generic `data-models.record-*` event ; the
 *     emit carries these as `subscriptionAliases` so the webhooks matcher
 *     routes the generic emit to the per-model subscription. Per-model event
 *     LITERALS can't join the codegen'd `DomainEvent` union, which is why
 *     the registry + alias split exists.
 *
 * Both registries are in-memory (plain `map.set`, last-write-wins, no boot
 * guard), so registrations are lost on restart. They're re-hydrated from the
 * DB at boot via `hydrateDataModelRegistrations` (called off the async boot
 * path, like `syncFlagsToDatabase`). Registering the same key twice is a
 * harmless overwrite — used to refresh the name-derived labels on rename.
 *
 * Model `key` is immutable after creation, so the derived permission / event
 * keys are stable for a model's lifetime ; only the human labels move on
 * rename.
 *
 * Multi-tenant safety: the entries are marked `orgScoped` and the display
 * readers (`/admin/rbac`'s catalog, the webhook picker) only SHOW an org the
 * entries a registered visibility resolver reports for it — see
 * `registerDataModelVisibilityResolvers` below. The registered KEYS are still
 * process-global + shared (two orgs with the same model key map to one entry),
 * which is correct : enforcement scopes by the model's org, and a shared key
 * stays grantable in any org that has the model. So there's no cross-org leak
 * even though registration is global. A hard-deleted model's registry entry
 * lingers until the next boot re-hydrates only live models, but it's already
 * hidden from every org's picker the moment the model is gone (no live model →
 * the resolver drops it).
 */

export type RegistrableModel = { key: string; name: string };

export const RECORD_VERBS = ["read", "write", "delete"] as const;
export type RecordVerb = (typeof RECORD_VERBS)[number];

/** Within-module permission key, e.g. `project-record-read`. */
export function perModelPermissionKey(modelKey: string, verb: RecordVerb): string {
  return `${modelKey}-record-${verb}`;
}

/** Dotted permission key for `requirePermission`, e.g. `data-models.project-record-read`. */
export function perModelPermissionDotted(modelKey: string, verb: RecordVerb): string {
  return `data-models.${perModelPermissionKey(modelKey, verb)}`;
}

/** Wire-level per-model event type, e.g. `data-models.project-record-created`. */
export function perModelEventType(
  modelKey: string,
  action: "created" | "updated" | "deleted",
): string {
  return `data-models.${modelKey}-record-${action}`;
}

/** Maps a generic record permission onto its record verb, or null for schema perms. */
export function recordPermissionVerb(dottedPermission: string): RecordVerb | null {
  switch (dottedPermission) {
    case "data-models.record-read":
      return "read";
    case "data-models.record-write":
      return "write";
    case "data-models.record-delete":
      return "delete";
    default:
      return null;
  }
}

// Groups the per-model entries together (and apart from the generic
// `data-models` category) in the RBAC catalog + webhook picker.
function groupLabel(name: string): string {
  return `Data Model: ${name}`;
}

/**
 * Register (or refresh) one model's per-model permissions + event types.
 * Idempotent — safe to call on every create/update and on boot hydration.
 */
export function registerDataModelRegistrations(model: RegistrableModel): void {
  const category = groupLabel(model.name);
  registerPermissions("data-models", {
    [perModelPermissionKey(model.key, "read")]: {
      description: `Read records in the "${model.name}" Data Model.`,
      category,
      orgScoped: true,
    },
    [perModelPermissionKey(model.key, "write")]: {
      description: `Create or edit records in the "${model.name}" Data Model.`,
      category,
      orgScoped: true,
    },
    [perModelPermissionKey(model.key, "delete")]: {
      description: `Delete records in the "${model.name}" Data Model.`,
      category,
      orgScoped: true,
    },
  });

  registerEventTypes(groupLabel(model.name), {
    [perModelEventType(model.key, "created")]: {
      description: `A record was created in the "${model.name}" Data Model.`,
      orgScoped: true,
    },
    [perModelEventType(model.key, "updated")]: {
      description: `A record in the "${model.name}" Data Model was updated.`,
      orgScoped: true,
    },
    [perModelEventType(model.key, "deleted")]: {
      description: `A record in the "${model.name}" Data Model was deleted.`,
      orgScoped: true,
    },
  });
}

// Register the org-scoped visibility resolvers once at api boot. They report,
// for a given org, exactly the per-model permission keys + event types of that
// org's LIVE models — so the RBAC catalog + webhook picker show each org only
// its own models' entries, even though the entries themselves are globally
// registered. Pure function-ref registration (no DB here) ; the DB query runs
// per admin catalog read.
export function registerDataModelVisibilityResolvers(): void {
  registerOrgScopedPermissionVisibility(async (organizationId) => {
    const models = await listLiveDataModelsForOrg(organizationId);
    return models.flatMap((m) => RECORD_VERBS.map((verb) => perModelPermissionDotted(m.key, verb)));
  });
  registerOrgScopedEventTypeVisibility(async (organizationId) => {
    const models = await listLiveDataModelsForOrg(organizationId);
    return models.flatMap((m) => [
      perModelEventType(m.key, "created"),
      perModelEventType(m.key, "updated"),
      perModelEventType(m.key, "deleted"),
    ]);
  });
}

/**
 * Re-register every live Data Model's per-model permissions + event types
 * into the in-memory registries. Called fire-and-forget at api boot to undo
 * the restart-wipes-the-registry effect. Best-effort : a failure logs and
 * leaves per-model entries absent until the next boot ; the generic
 * `data-models.record-*` fallback (and admin short-circuit) keep access
 * working in the meantime.
 */
export async function hydrateDataModelRegistrations(): Promise<void> {
  const models = await listAllDataModelsForRegistration();
  for (const model of models) {
    registerDataModelRegistrations({ key: model.key, name: model.name });
  }
}
