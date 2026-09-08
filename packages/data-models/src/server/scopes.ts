import { getDb, type Prisma, type DataRecordScopeVerb } from "@monark/db";
import { buildCompileFields, dataRecordMatchesFilter, listDataFields } from "./data";
import { ValidationError } from "@monark/common";
import {
  collectTraversalRelationKeys,
  filterQuerySchema,
  group,
  type FilterNode,
} from "../contracts/query";
import { perModelPermissionDotted, type RecordVerb } from "./registrations";

/**
 * MQL-scoped record permissions.
 *
 * A `DataModelRoleScope` says: this role may perform this verb on the records
 * of this model that satisfy `query`. The load-bearing rule is that **roles stay
 * additive** — they grant, they never subtract. So the effective predicate is
 *
 *   OR over every role the caller holds that GRANTS the verb on this model,
 *   of that role's scope (or TRUE when that role has no scope row)
 *
 * which means holding one unscoped granting role leaves you unrestricted, and a
 * scope only ever narrows the access conferred by its own role. Anything else
 * would make adding a scope to one role silently restrict a user who also holds
 * a broader one.
 *
 * No rows anywhere = today's behavior, so this is inert until configured.
 */

/** The scope verbs the API accepts today. The column carries WRITE / DELETE so
 *  the schema is stable, but only READ is enforced in this release ; exposing a
 *  verb the engine ignores would be a configurable no-op, which is worse than
 *  not offering it. Write-side scoping needs post-write revalidation inside a
 *  transaction (a record must not be editable *out of* its own scope), which is
 *  its own slice. */
export const ENFORCED_SCOPE_VERBS = ["READ"] as const satisfies readonly DataRecordScopeVerb[];
export type EnforcedScopeVerb = (typeof ENFORCED_SCOPE_VERBS)[number];

/** The registered permissions that grant a record verb on a model : the
 *  per-model key, or the generic one. Mirrors `requireModelAccess`. */
function grantingPermissionsFor(modelKey: string, verb: RecordVerb): string[] {
  return [perModelPermissionDotted(modelKey, verb), `data-models.record-${verb}`];
}

const VERB_TO_RECORD_VERB: Record<EnforcedScopeVerb, RecordVerb> = { READ: "read" };

/** Parse a stored scope tree. A row that fails validation **denies** rather
 *  than degrading open : a filter that silently stops filtering is an
 *  authorization bug, not a 400. Callers translate `null` into "match nothing". */
export function parseScopeQuery(raw: unknown): FilterNode | null {
  const parsed = filterQuerySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Resolve the caller's effective READ scope for a model.
 *
 * Returns `undefined` when unrestricted (no scope applies), or a `FilterNode`
 * every visible record must satisfy. `null` means **deny everything** — used
 * when a stored scope is unparseable, so a corrupted row fails closed.
 */
export async function resolveRecordScope(input: {
  roleIds: string[];
  dataModelId: string;
  modelKey: string;
  verb: EnforcedScopeVerb;
}): Promise<FilterNode | undefined | null> {
  if (input.roleIds.length === 0) return undefined;
  const db = getDb();
  const recordVerb = VERB_TO_RECORD_VERB[input.verb];
  const permissions = grantingPermissionsFor(input.modelKey, recordVerb);

  const [grants, scopes] = await Promise.all([
    db.rolePermission.findMany({
      where: {
        roleId: { in: input.roleIds },
        module: "data-models",
        permission: { in: permissions.map((p) => p.slice("data-models.".length)) },
      },
      select: { roleId: true },
    }),
    db.dataModelRoleScope.findMany({
      where: { roleId: { in: input.roleIds }, dataModelId: input.dataModelId, verb: input.verb },
    }),
  ]);

  const grantingRoleIds = new Set(grants.map((g) => g.roleId));
  // The caller reached this model some other way (an admin short-circuit, or a
  // permission not attributable to a stored role row). Nothing to narrow.
  if (grantingRoleIds.size === 0) return undefined;

  const byRole = new Map<string, DataModelRoleScopeRow>();
  for (const s of scopes) if (grantingRoleIds.has(s.roleId)) byRole.set(s.roleId, s);

  // At least one granting role is unscoped => that role grants unrestricted
  // access, and roles are additive.
  if (byRole.size < grantingRoleIds.size) return undefined;

  const trees: FilterNode[] = [];
  for (const row of byRole.values()) {
    const tree = parseScopeQuery(row.query);
    // Fail closed: a scope we cannot parse must not silently stop filtering.
    if (!tree) return null;
    trees.push(tree);
  }
  if (trees.length === 0) return undefined;
  return trees.length === 1 && trees[0] ? trees[0] : group("or", trees);
}

/** Combine a caller-supplied filter with an access scope. Both optional ; the
 *  result is the AND of whatever is present. */
export function andFilters(
  a: FilterNode | undefined,
  b: FilterNode | undefined,
): FilterNode | undefined {
  if (!a) return b;
  if (!b) return a;
  return group("and", [a, b]);
}

/** Whether this model has ANY scope configured. One indexed lookup, used to
 *  keep the fan-out paths on their cheap path when nobody has scoped the model
 *  (the overwhelmingly common case). */
export async function modelHasAnyScope(dataModelId: string): Promise<boolean> {
  const hit = await getDb().dataModelRoleScope.findFirst({
    where: { dataModelId },
    select: { id: true },
  });
  return hit !== null;
}

/**
 * True when one record is inside the caller's READ scope for its model. The
 * side-door check: used by global search and the watcher fan-out, which reach
 * records without going through `records.list`, and would otherwise surface a
 * record the caller cannot open.
 *
 * Fast path: a caller with no scope on this model does zero extra work beyond
 * the one indexed scope lookup.
 */
export async function isRecordInScope(input: {
  recordId: string;
  userId: string;
  roleIds: string[];
  bypass: boolean;
  model: { id: string; key: string };
}): Promise<boolean> {
  if (input.bypass) return true;
  const scope = await resolveRecordScope({
    roleIds: input.roleIds,
    dataModelId: input.model.id,
    modelKey: input.model.key,
    verb: "READ",
  });
  if (scope === undefined) return true;
  if (scope === null) return false; // unparseable stored scope fails closed
  const fields = await listDataFields(input.model.id);
  return dataRecordMatchesFilter({
    recordId: input.recordId,
    filter: scope,
    fields: buildCompileFields(fields),
    queryContext: { userId: input.userId, now: new Date() },
  });
}

// ── Management (CRUD) ────────────────────────────────────────

export type DataModelRoleScopeRow = Prisma.DataModelRoleScopeGetPayload<Record<string, never>>;

/** True when the role exists and belongs to this org (or is a global built-in),
 *  so a scope can never be attached to another tenant's role. */
export async function isScopableRole(roleId: string, organizationId: string): Promise<boolean> {
  const role = await getDb().role.findUnique({
    where: { id: roleId },
    select: { organizationId: true },
  });
  if (!role) return false;
  return role.organizationId === null || role.organizationId === organizationId;
}

export async function listScopesForModel(dataModelId: string): Promise<DataModelRoleScopeRow[]> {
  // Bounded by (roles x verbs) for one model ; an org has tens of roles, so an
  // unbounded read is correct here and pagination would only add ceremony.
  return getDb().dataModelRoleScope.findMany({
    where: { dataModelId },
    orderBy: [{ roleId: "asc" }, { verb: "asc" }],
  });
}

/** Every scope attached to one role, across models. Bounded by (models x
 *  verbs) for a single role, so an unbounded read is right here. */
export async function listScopesForRole(roleId: string): Promise<DataModelRoleScopeRow[]> {
  return getDb().dataModelRoleScope.findMany({
    where: { roleId },
    orderBy: [{ dataModelId: "asc" }, { verb: "asc" }],
  });
}

export async function upsertScope(input: {
  roleId: string;
  dataModelId: string;
  verb: EnforcedScopeVerb;
  query: FilterNode;
  createdBy: string;
}): Promise<DataModelRoleScopeRow> {
  const parsed = filterQuerySchema.safeParse(input.query);
  if (!parsed.success) throw new ValidationError("Invalid scope query.", parsed.error.issues);
  // Relation traversal is rejected inside a scope. A traversal reads the TARGET
  // model, so allowing it here would let a scope's evaluation depend on rows the
  // scoped role cannot see, and would need the target's own row-access threaded
  // into a predicate that runs before we know which record we are judging.
  // Refusing it up front is a smaller, checkable rule than getting that right.
  const traversed = collectTraversalRelationKeys(parsed.data);
  if (traversed.size > 0) {
    throw new ValidationError(
      `A scope cannot traverse a relation (found ${[...traversed].join(", ")}). Filter on this model's own fields.`,
    );
  }
  return getDb().dataModelRoleScope.upsert({
    where: {
      roleId_dataModelId_verb: {
        roleId: input.roleId,
        dataModelId: input.dataModelId,
        verb: input.verb,
      },
    },
    // The tree is a plain JSON-serializable structure ; Prisma's InputJsonValue
    // just can't see that through the discriminated union.
    create: { ...input, query: input.query as unknown as Prisma.InputJsonValue },
    update: { query: input.query as unknown as Prisma.InputJsonValue },
  });
}

export async function deleteScope(input: {
  roleId: string;
  dataModelId: string;
  verb: EnforcedScopeVerb;
}): Promise<boolean> {
  const res = await getDb().dataModelRoleScope.deleteMany({ where: input });
  return res.count > 0;
}
