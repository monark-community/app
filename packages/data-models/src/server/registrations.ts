import { registerEventTypes } from "@monark/common";
import { registerPermissions } from "@monark/rbac/server";
import { listAllDataModelsForRegistration } from "./data";

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
 * NOTE (multi-tenant): the registries are process-global and the readers
 * (`/admin/rbac`'s permission catalog, the webhooks event-type picker) list
 * them unfiltered. Under the current single-tenant deploy that's correct —
 * there is one org, so the global set IS that org's set. A true multi-tenant
 * deploy would leak one org's model keys into every org's picker and would
 * need those readers to filter the `data-models.<key>-*` entries by the
 * caller's org. Tracked in the package README's "Deferred" section. Likewise
 * a hard-deleted model's entries linger until the next boot re-hydrates only
 * live models.
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
    },
    [perModelPermissionKey(model.key, "write")]: {
      description: `Create or edit records in the "${model.name}" Data Model.`,
      category,
    },
    [perModelPermissionKey(model.key, "delete")]: {
      description: `Delete records in the "${model.name}" Data Model.`,
      category,
    },
  });

  registerEventTypes(groupLabel(model.name), {
    [perModelEventType(model.key, "created")]: {
      description: `A record was created in the "${model.name}" Data Model.`,
    },
    [perModelEventType(model.key, "updated")]: {
      description: `A record in the "${model.name}" Data Model was updated.`,
    },
    [perModelEventType(model.key, "deleted")]: {
      description: `A record in the "${model.name}" Data Model was deleted.`,
    },
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
