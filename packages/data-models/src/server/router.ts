import { z } from "zod";
import { router, publicProcedure } from "@monark/common/trpc";
import {
  emit,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@monark/common";
import { MAX_PAGE_SIZE } from "@monark/common/pagination";
import { requireOrg } from "@monark/organizations/server";
import {
  getUserRoles,
  hasPermission,
  requirePermission,
  type RbacContext,
} from "@monark/rbac/server";
import {
  perModelEventType,
  perModelPermissionDotted,
  recordPermissionVerb,
  registerDataModelRegistrations,
} from "./registrations";
import { isWatchingModel, isWatchingRecord, setModelWatch, setRecordWatch } from "./watchers";
import { DATA_FIELD_TYPES, TITLE_FIELD_KEY, type DataFieldType } from "../contracts/field-types";
import { listModelIntegrations } from "../contracts/integrations";
import { getFieldIndexStatus, requestFieldIndex } from "./indexing";
import {
  collectTraversalRelationKeys,
  filterableKindOf,
  filterQuerySchema,
  type FilterableKind,
  type FilterNode,
} from "../contracts/query";
import type { RelationTargets } from "./query-compiler";
import type {
  DataModelRecordCreatedEvent,
  DataModelRecordDeletedEvent,
  DataModelRecordUpdatedEvent,
  DataModelSchemaChangedEvent,
} from "../contracts/events";
import {
  archiveDataField,
  createDataField,
  createDataModel,
  createDataRecord,
  findDataFieldById,
  findDataModelById,
  findDataModelByKey,
  findDataRecordById,
  getDataRecordRoleAccess,
  isDataRecordRoleAccessible,
  setDataRecordRoleAccess,
  findFreeDataFieldKey,
  findFreeDataModelKey,
  hardDeleteDataModel,
  hardDeleteDataRecord,
  buildCompileFields,
  recordRoleAccessSql,
  createDataRecordView,
  deleteDataRecordView,
  findDataRecordViewById,
  listDataFields,
  listDataModels,
  listDataRecords,
  listDataRecordsWithQuery,
  listDataRecordViews,
  updateDataRecordView,
  listModelIntegrationsForModel,
  reorderDataFields,
  restoreDataModel,
  restoreDataRecord,
  softDeleteDataModel,
  softDeleteDataRecord,
  unarchiveDataField,
  updateDataField,
  updateDataModel,
  updateDataRecord,
  upsertModelIntegration,
  type DataFieldRow,
  type DataModelIntegrationRow,
  type DataModelRow,
  type DataRecordRow,
  type DataRecordViewRow,
} from "./data";

const paginationInput = {
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).nullish(),
};

// Same shape as the organizations slug regex — Data Model keys are route
// segments, so they get the same alphanumeric-plus-dashes constraint.
const KEY_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const modelKeySchema = z
  .string()
  .trim()
  .min(2, "key must be at least 2 characters")
  .max(60, "key must be at most 60 characters")
  .regex(KEY_REGEX, "key must be lowercase alphanumeric with dashes");

// Field keys are JSON property names inside DataRecord.data, so they're
// snake_case and must start with a letter.
const FIELD_KEY_REGEX = /^[a-z][a-z0-9_]*$/;
const fieldKeySchema = z
  .string()
  .trim()
  .min(1, "key must be at least 1 character")
  .max(60, "key must be at most 60 characters")
  .regex(
    FIELD_KEY_REGEX,
    "key must be lowercase alphanumeric with underscores, starting with a letter",
  );

// Flattens a Prisma `Json` column to a plain object at the wire boundary.
// `Json` (`Prisma.JsonValue`) is a recursive type ; letting it flow into the
// tRPC client makes TypeScript try to materialize that recursion the
// moment a consuming component so much as declares the query/mutation
// hook, which trips TS2589 ("type instantiation is excessively deep").
// Same fix webhooks already needed for `WebhookDelivery.payload` — see
// packages/webhooks/src/server/router.ts's `getDelivery`. Cast to
// `Record<string, unknown>`, not bare `unknown` : every one of these
// columns is always a JSON *object* (never a primitive), and a bare
// `unknown` return type structurally includes `undefined`, which tRPC's
// client-side inference (no transformer here — see the plain-JSON note in
// packages/common/src/trpc.ts) reflects by making the whole property
// optional, since `JSON.stringify` drops an `undefined`-valued key.
type SerializedField = Omit<DataFieldRow, "config"> & { config: Record<string, unknown> };
function serializeField(field: DataFieldRow): SerializedField {
  return { ...field, config: field.config as Record<string, unknown> };
}

type SerializedRecord = Omit<DataRecordRow, "data"> & { data: Record<string, unknown> };
function serializeRecord(record: DataRecordRow): SerializedRecord {
  return { ...record, data: record.data as Record<string, unknown> };
}

type SerializedIntegration = Omit<DataModelIntegrationRow, "slotMappings"> & {
  slotMappings: Record<string, unknown>;
};
function serializeIntegration(integration: DataModelIntegrationRow): SerializedIntegration {
  return { ...integration, slotMappings: integration.slotMappings as Record<string, unknown> };
}

type DataModelsPermission =
  | "data-models.manage-schema"
  | "data-models.read-schema"
  | "data-models.record-read"
  | "data-models.record-write"
  | "data-models.record-bulk-write"
  | "data-models.record-delete";

// Cap on how many records one bulk edit touches, so a runaway selection can't
// fan out into thousands of sequential row updates + events in one request.
const BULK_UPDATE_MAX = 500;

// Every Data Model is org-scoped : gate on the caller's own org, and 404
// rather than leak the existence of another org's model.
//
// Record permissions (record-read/write/delete) are satisfied by EITHER the
// per-model key (`data-models.<key>-record-<verb>`) OR the generic key — so a
// role granted just one model's records passes, and the blanket grant keeps
// working. ADMIN/SYSADMIN short-circuit both. Schema permissions
// (read-schema / manage-schema) have no per-model variant and gate directly.
async function requireModelAccess(
  ctx: RbacContext,
  model: DataModelRow,
  permission: DataModelsPermission,
): Promise<string> {
  // Callers only reach here after their own `if (!ctx.userId) throw ...`
  // guard, so this cast is safe — RbacContext types userId nullable because
  // the anonymous case is valid for other callers of requirePermission.
  const userId = ctx.userId as string;
  const org = await requireOrg({
    userId,
    activeOrganizationId: ctx.activeOrganizationId,
  });
  if (model.organizationId !== org.id) {
    throw new NotFoundError("DataModel", model.id);
  }

  const verb = recordPermissionVerb(permission);
  if (verb) {
    const perModel = perModelPermissionDotted(model.key, verb);
    const [okPerModel, okGeneric] = await Promise.all([
      hasPermission(userId, perModel, org.id),
      hasPermission(userId, permission, org.id),
    ]);
    if (!okPerModel && !okGeneric) {
      throw new ForbiddenError(`Missing required permission: ${perModel}`);
    }
    return org.id;
  }

  await requirePermission(ctx, permission, org.id);
  return org.id;
}

// Row-level access context for record reads : the caller's role ids, plus a
// bypass for data admins (`data-models.manage-schema`, which ADMIN/SYSADMIN
// short-circuit). Layered on top of the model-level `requireModelAccess`.
async function recordAccessContext(
  userId: string,
  orgId: string,
): Promise<{ roleIds: string[]; bypass: boolean }> {
  const [roles, bypass] = await Promise.all([
    getUserRoles(userId, orgId),
    hasPermission(userId, "data-models.manage-schema", orgId),
  ]);
  return { roleIds: roles.map((r) => r.id), bypass };
}

async function requireModelById(id: string): Promise<DataModelRow> {
  const model = await findDataModelById(id);
  if (!model) throw new NotFoundError("DataModel", id);
  return model;
}

// Resolve the target models a query traverses into (`relation.subField`). Only
// DATA_MODEL relations in the caller's org are traversable, and only if the
// caller can read the target model's records (else a 403) — the target's own
// row-level access is then applied inside the traversal subquery, so traversal
// can't surface a related record the caller couldn't see directly. A relation
// left unresolved here makes the compiler reject its traversal leaf (400).
async function buildRelationTargets(
  ctx: RbacContext,
  sourceModel: DataModelRow,
  sourceFields: DataFieldRow[],
  filter: FilterNode,
  access: { roleIds: string[]; bypass: boolean },
): Promise<RelationTargets> {
  const targets: RelationTargets = new Map();
  for (const relKey of collectTraversalRelationKeys(filter)) {
    const field = sourceFields.find((f) => f.key === relKey);
    if (!field || field.type !== "RELATION") continue;
    const config = field.config as {
      relationTarget?: string;
      relationTargetKind?: string;
    } | null;
    if (config?.relationTargetKind !== "DATA_MODEL" || !config.relationTarget) continue;
    const targetModel = await findDataModelByKey(sourceModel.organizationId, config.relationTarget);
    if (!targetModel) continue;
    await requireModelAccess(ctx, targetModel, "data-models.record-read");
    const targetFields = buildCompileFields(await listDataFields(targetModel.id));
    targets.set(relKey, {
      dataModelId: targetModel.id,
      fields: targetFields,
      roleAccess: recordRoleAccessSql(access.roleIds, access.bypass, "t"),
    });
  }
  return targets;
}

// A saved view, serialized for the client : the `query` JSON is surfaced as a
// typed FilterNode (avoids leaking Prisma's recursive JsonValue into the tRPC
// output type), plus a `mine` flag so the UI can gate rename/delete/share.
function serializeView(view: DataRecordViewRow, userId: string) {
  return {
    id: view.id,
    dataModelId: view.dataModelId,
    name: view.name,
    query: view.query as unknown as FilterNode,
    shared: view.shared,
    mine: view.createdBy === userId,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  };
}

// Query-bar field metadata (mirrors the web `QueryFieldMeta`) : identity, the
// resolved filter `kind` (so the client stays schema-agnostic — no DataFieldType
// on the wire), and the value options the autocomplete + DSL parser need.
type QueryFieldMeta = {
  key: string;
  label: string;
  kind: FilterableKind;
  options?: { value: string; label: string }[];
};

function toQueryField(f: DataFieldRow): QueryFieldMeta {
  const cfg = (f.config ?? {}) as {
    options?: { value: string; label: string }[];
    expression?: string;
  };
  // No type today resolves to a null kind ; `text` is the safe universal view.
  const kind =
    filterableKindOf(f.type as DataFieldType, { formulaExpression: cfg.expression }) ?? "text";
  return {
    key: f.key,
    label: f.label,
    kind,
    ...(cfg.options ? { options: cfg.options } : {}),
  };
}

// Load a view and assert the caller owns it — a shared view is readable by all
// but only its creator may edit or delete it.
async function requireOwnedView(id: string, userId: string): Promise<DataRecordViewRow> {
  const view = await findDataRecordViewById(id);
  if (!view) throw new NotFoundError("DataRecordView", id);
  if (view.createdBy !== userId) throw new ForbiddenError("You can only edit your own views.");
  return view;
}

export const dataModelsRouter = router({
  models: router({
    // Every Data Model in the caller's active org.
    list: publicProcedure
      .input(
        z
          .object({
            includeDeleted: z.boolean().optional(),
            search: z.string().trim().max(120).optional(),
            ...paginationInput,
          })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        await requirePermission(ctx, "data-models.read-schema", org.id);
        return listDataModels({
          organizationId: org.id,
          includeDeleted: input?.includeDeleted ?? false,
          search: input?.search,
          limit: input?.limit,
          cursor: input?.cursor,
        });
      }),

    getById: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const model = await requireModelById(input.id);
        await requireModelAccess(ctx, model, "data-models.read-schema");
        return model;
      }),

    // Looked up by key within the caller's active org (keys are unique per org).
    getByKey: publicProcedure
      .input(z.object({ key: modelKeySchema }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        await requirePermission(ctx, "data-models.read-schema", org.id);
        const model = await findDataModelByKey(org.id, input.key);
        if (!model) throw new NotFoundError("DataModel", input.key);
        return model;
      }),

    // A Data Model is always created under the caller's own active org —
    // never a client-supplied organizationId, and never platform-wide (those
    // are disallowed) — so an org admin can't mint a model under another org.
    create: publicProcedure
      .input(
        z.object({
          key: modelKeySchema.optional(),
          name: z.string().trim().min(1).max(80),
          description: z.string().max(2000).nullable().optional(),
          icon: z.string().max(60).nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const organizationId = org.id;
        await requirePermission(ctx, "data-models.manage-schema", organizationId);

        if (input.key) {
          const collision = await findDataModelByKey(organizationId, input.key);
          if (collision) {
            throw new ValidationError(`Data Model key "${input.key}" is already taken.`);
          }
        }
        const key = input.key ?? (await findFreeDataModelKey(organizationId, input.name));

        const model = await createDataModel({
          organizationId,
          key,
          name: input.name,
          description: input.description ?? null,
          icon: input.icon ?? null,
          createdBy: ctx.userId,
        });

        // Auto-register this model's per-model permissions + event types so
        // its records are individually grantable (RBAC) and subscribable
        // (webhooks) the moment it exists. See ./registrations.
        registerDataModelRegistrations({ key: model.key, name: model.name });

        const event: DataModelSchemaChangedEvent = {
          type: "data-models.schema-changed",
          dataModelId: model.id,
          kind: "model",
          actorId: ctx.userId,
          occurredAt: new Date(),
        };
        await emit(event).catch(() => {});

        return model;
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.string().min(1),
          name: z.string().trim().min(1).max(80).optional(),
          description: z.string().max(2000).nullable().optional(),
          icon: z.string().max(60).nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const existing = await requireModelById(input.id);
        await requireModelAccess(ctx, existing, "data-models.manage-schema");

        const updated = await updateDataModel(input.id, {
          name: input.name,
          description: input.description,
          icon: input.icon,
        });

        // Refresh the per-model permission / event-type labels — the model
        // key is immutable so the keys are stable, but a rename should update
        // the human descriptions in the RBAC catalog + webhook picker.
        registerDataModelRegistrations({ key: updated.key, name: updated.name });

        const event: DataModelSchemaChangedEvent = {
          type: "data-models.schema-changed",
          dataModelId: updated.id,
          kind: "model",
          actorId: ctx.userId,
          occurredAt: new Date(),
        };
        await emit(event).catch(() => {});

        return updated;
      }),

    delete: publicProcedure
      .input(z.object({ id: z.string().min(1), hard: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const existing = await requireModelById(input.id);
        await requireModelAccess(ctx, existing, "data-models.manage-schema");

        const hard = input.hard ?? false;
        if (hard) {
          await hardDeleteDataModel(input.id);
        } else {
          await softDeleteDataModel(input.id);
        }

        const event: DataModelSchemaChangedEvent = {
          type: "data-models.schema-changed",
          dataModelId: input.id,
          kind: "model",
          actorId: ctx.userId,
          occurredAt: new Date(),
        };
        await emit(event).catch(() => {});
      }),

    restore: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const existing = await requireModelById(input.id);
        await requireModelAccess(ctx, existing, "data-models.manage-schema");
        if (!existing.deletedAt) {
          throw new ValidationError("Data Model is not deleted.");
        }
        await restoreDataModel(input.id);
      }),

    // Watch a whole model : get notified when any of its records changes.
    // Gated on record-read — you can watch a model whose records you can see.
    isWatching: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const model = await requireModelById(input.id);
        await requireModelAccess(ctx, model, "data-models.record-read");
        return { watching: await isWatchingModel(model.id, ctx.userId) };
      }),

    setWatch: publicProcedure
      .input(z.object({ id: z.string().min(1), watching: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const model = await requireModelById(input.id);
        await requireModelAccess(ctx, model, "data-models.record-read");
        await setModelWatch(model.id, ctx.userId, input.watching);
        return { watching: input.watching };
      }),
  }),

  fields: router({
    list: publicProcedure
      .input(z.object({ dataModelId: z.string().min(1), includeArchived: z.boolean().optional() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const model = await requireModelById(input.dataModelId);
        await requireModelAccess(ctx, model, "data-models.read-schema");
        const fields = await listDataFields(input.dataModelId, {
          includeArchived: input.includeArchived,
        });
        return fields.map(serializeField);
      }),

    create: publicProcedure
      .input(
        z.object({
          dataModelId: z.string().min(1),
          key: fieldKeySchema.optional(),
          label: z.string().trim().min(1).max(80),
          description: z.string().max(2000).nullable().optional(),
          type: z.enum(DATA_FIELD_TYPES),
          config: z.unknown().optional(),
          required: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const model = await requireModelById(input.dataModelId);
        await requireModelAccess(ctx, model, "data-models.manage-schema");

        const key = input.key ?? (await findFreeDataFieldKey(input.dataModelId, input.label));
        const field = await createDataField({
          dataModelId: input.dataModelId,
          key,
          label: input.label,
          description: input.description ?? null,
          type: input.type,
          config: input.config ?? {},
          required: input.required,
        });

        const event: DataModelSchemaChangedEvent = {
          type: "data-models.schema-changed",
          dataModelId: input.dataModelId,
          kind: "field",
          actorId: ctx.userId,
          occurredAt: new Date(),
        };
        await emit(event).catch(() => {});

        return serializeField(field);
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.string().min(1),
          label: z.string().trim().min(1).max(80).optional(),
          description: z.string().max(2000).nullable().optional(),
          config: z.unknown().optional(),
          required: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const field = await findDataFieldById(input.id);
        if (!field) throw new NotFoundError("DataField", input.id);
        const model = await requireModelById(field.dataModelId);
        await requireModelAccess(ctx, model, "data-models.manage-schema");

        // The reserved title field is always required ; its label stays
        // editable (e.g. rename to "Name") but it can't be made optional.
        if (field.key === TITLE_FIELD_KEY && input.required === false) {
          throw new ValidationError("The Title field is always required.");
        }

        const updated = await updateDataField(input.id, {
          label: input.label,
          description: input.description,
          config: input.config,
          required: input.required,
        });

        const event: DataModelSchemaChangedEvent = {
          type: "data-models.schema-changed",
          dataModelId: model.id,
          kind: "field",
          actorId: ctx.userId,
          occurredAt: new Date(),
        };
        await emit(event).catch(() => {});

        return serializeField(updated);
      }),

    reorder: publicProcedure
      .input(
        z.object({ dataModelId: z.string().min(1), orderedIds: z.array(z.string().min(1)).min(1) }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const model = await requireModelById(input.dataModelId);
        await requireModelAccess(ctx, model, "data-models.manage-schema");

        const existing = await listDataFields(input.dataModelId, { includeArchived: true });
        const existingIds = new Set(existing.map((f) => f.id));
        if (
          input.orderedIds.length !== existingIds.size ||
          !input.orderedIds.every((id) => existingIds.has(id))
        ) {
          throw new ValidationError("orderedIds must be exactly the model's current field ids.");
        }

        await reorderDataFields(input.dataModelId, input.orderedIds);

        const event: DataModelSchemaChangedEvent = {
          type: "data-models.schema-changed",
          dataModelId: model.id,
          kind: "field",
          actorId: ctx.userId,
          occurredAt: new Date(),
        };
        await emit(event).catch(() => {});
      }),

    archive: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const field = await findDataFieldById(input.id);
        if (!field) throw new NotFoundError("DataField", input.id);
        const model = await requireModelById(field.dataModelId);
        await requireModelAccess(ctx, model, "data-models.manage-schema");

        // The reserved title field backs every record's title ; it can't be
        // archived (nor deleted or retyped — type is immutable after create).
        if (field.key === TITLE_FIELD_KEY) {
          throw new ValidationError("The Title field can't be archived.");
        }

        await archiveDataField(input.id);

        const event: DataModelSchemaChangedEvent = {
          type: "data-models.schema-changed",
          dataModelId: model.id,
          kind: "field",
          actorId: ctx.userId,
          occurredAt: new Date(),
        };
        await emit(event).catch(() => {});
      }),

    unarchive: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const field = await findDataFieldById(input.id);
        if (!field) throw new NotFoundError("DataField", input.id);
        const model = await requireModelById(field.dataModelId);
        await requireModelAccess(ctx, model, "data-models.manage-schema");

        await unarchiveDataField(input.id);

        const event: DataModelSchemaChangedEvent = {
          type: "data-models.schema-changed",
          dataModelId: model.id,
          kind: "field",
          actorId: ctx.userId,
          occurredAt: new Date(),
        };
        await emit(event).catch(() => {});
      }),

    // Kicks off (or reports the status of) an expression index for a hot
    // field — see indexing.ts. Returns immediately ; the DDL runs in the
    // background, so the caller polls `indexStatus` / `fields.list`'s
    // `indexed` flag to know when it lands.
    requestIndex: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const field = await findDataFieldById(input.id);
        if (!field) throw new NotFoundError("DataField", input.id);
        const model = await requireModelById(field.dataModelId);
        await requireModelAccess(ctx, model, "data-models.manage-schema");
        return requestFieldIndex(field);
      }),

    indexStatus: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const field = await findDataFieldById(input.id);
        if (!field) throw new NotFoundError("DataField", input.id);
        const model = await requireModelById(field.dataModelId);
        await requireModelAccess(ctx, model, "data-models.read-schema");
        return { status: await getFieldIndexStatus(input.id) };
      }),
  }),

  integrations: router({
    // Reads the in-memory registry, no DB — every registered module's slot
    // catalog, so the generic admin UI can render one card per module
    // without hardcoding any module's name.
    listAvailable: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "data-models.read-schema", org.id);
      return listModelIntegrations();
    }),

    get: publicProcedure
      .input(z.object({ dataModelId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const model = await requireModelById(input.dataModelId);
        await requireModelAccess(ctx, model, "data-models.read-schema");
        const integrations = await listModelIntegrationsForModel(input.dataModelId);
        return integrations.map(serializeIntegration);
      }),

    save: publicProcedure
      .input(
        z.object({
          dataModelId: z.string().min(1),
          module: z.string().min(1).max(60),
          slotMappings: z.record(z.string(), z.string().min(1)),
          enabled: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const model = await requireModelById(input.dataModelId);
        await requireModelAccess(ctx, model, "data-models.manage-schema");

        const integration = await upsertModelIntegration({
          dataModelId: input.dataModelId,
          module: input.module,
          slotMappings: input.slotMappings,
          enabled: input.enabled,
        });

        const event: DataModelSchemaChangedEvent = {
          type: "data-models.schema-changed",
          dataModelId: model.id,
          kind: "integration",
          actorId: ctx.userId,
          occurredAt: new Date(),
        };
        await emit(event).catch(() => {});

        return serializeIntegration(integration);
      }),
  }),

  records: router({
    list: publicProcedure
      .input(
        z.object({
          dataModelId: z.string().min(1),
          includeDeleted: z.boolean().optional(),
          search: z.string().trim().max(120).optional(),
          // Per-field value predicates from the list filter menu. `value` is
          // the raw control value : a string (text / number / boolean "true" /
          // date / select) or a string[] (multi-select). ANDed on the server.
          fieldFilters: z
            .array(
              z.object({
                key: z.string().min(1),
                type: z.enum([
                  "text",
                  "number",
                  "boolean",
                  "date",
                  "select",
                  "selectAny",
                  "multiSelect",
                ]),
                value: z.union([z.string(), z.array(z.string())]),
              }),
            )
            .max(50)
            .optional(),
          // Structured query language (MonarkQL) tree — advanced operators +
          // boolean groups. When present it takes precedence over the legacy
          // `fieldFilters` and runs the raw-SQL compiled path.
          filter: filterQuerySchema.optional(),
          ...paginationInput,
        }),
      )
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const model = await requireModelById(input.dataModelId);
        const orgId = await requireModelAccess(ctx, model, "data-models.record-read");
        const access = await recordAccessContext(ctx.userId, orgId);
        if (input.filter) {
          const fields = await listDataFields(input.dataModelId);
          const relationTargets = await buildRelationTargets(
            ctx,
            model,
            fields,
            input.filter,
            access,
          );
          const page = await listDataRecordsWithQuery({
            dataModelId: input.dataModelId,
            includeDeleted: input.includeDeleted ?? false,
            search: input.search,
            filter: input.filter,
            fields: buildCompileFields(fields),
            queryContext: { userId: ctx.userId, now: new Date() },
            relationTargets,
            limit: input.limit,
            cursor: input.cursor,
            roleIds: access.roleIds,
            bypassRoleAccess: access.bypass,
          });
          return { ...page, items: page.items.map(serializeRecord) };
        }
        const page = await listDataRecords({
          dataModelId: input.dataModelId,
          includeDeleted: input.includeDeleted ?? false,
          search: input.search,
          fieldFilters: input.fieldFilters,
          limit: input.limit,
          cursor: input.cursor,
          roleIds: access.roleIds,
          bypassRoleAccess: access.bypass,
        });
        return { ...page, items: page.items.map(serializeRecord) };
      }),

    // Field metadata for the query bar (MonarkQL) : the model's own fields plus
    // "virtual" dotted fields for one-level relation traversal
    // (`assignee.title`), so the bar can parse + autocomplete them. Traversal
    // virtuals are only included for a DATA_MODEL relation the caller can read.
    queryFields: publicProcedure
      .input(z.object({ dataModelId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const model = await requireModelById(input.dataModelId);
        const orgId = await requireModelAccess(ctx, model, "data-models.record-read");
        const fields = (await listDataFields(input.dataModelId)).filter((f) => !f.archivedAt);
        const out: QueryFieldMeta[] = fields.map(toQueryField);

        for (const f of fields) {
          if (f.type !== "RELATION") continue;
          const cfg = f.config as { relationTarget?: string; relationTargetKind?: string } | null;
          if (cfg?.relationTargetKind !== "DATA_MODEL" || !cfg.relationTarget) continue;
          const target = await findDataModelByKey(orgId, cfg.relationTarget);
          if (!target) continue;
          // Skip (don't 403 the whole call) a target the caller can't read.
          try {
            await requireModelAccess(ctx, target, "data-models.record-read");
          } catch {
            continue;
          }
          const subs = (await listDataFields(target.id)).filter(
            (s) => !s.archivedAt && s.type !== "RELATION", // one level only
          );
          for (const s of subs) {
            const meta = toQueryField(s);
            out.push({ ...meta, key: `${f.key}.${s.key}`, label: `${f.label} › ${s.label}` });
          }
        }
        return out;
      }),

    getById: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const record = await findDataRecordById(input.id);
        if (!record) throw new NotFoundError("DataRecord", input.id);
        const model = await requireModelById(record.dataModelId);
        const orgId = await requireModelAccess(ctx, model, "data-models.record-read");
        // Row-level : a record restricted to certain roles is a 404 (not 403)
        // for callers whose roles aren't on the list, so we don't leak that a
        // record they can't see exists.
        const access = await recordAccessContext(ctx.userId, orgId);
        if (!(await isDataRecordRoleAccessible(record.id, access))) {
          throw new NotFoundError("DataRecord", input.id);
        }
        return serializeRecord(record);
      }),

    create: publicProcedure
      .input(
        z.object({
          dataModelId: z.string().min(1),
          slug: z.string().trim().min(1).max(60).nullable().optional(),
          data: z.record(z.string(), z.unknown()),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const model = await requireModelById(input.dataModelId);
        await requireModelAccess(ctx, model, "data-models.record-write");

        const record = await createDataRecord({
          dataModelId: input.dataModelId,
          slug: input.slug,
          data: input.data,
          createdBy: ctx.userId,
        });

        const event: DataModelRecordCreatedEvent = {
          type: "data-models.record-created",
          dataModelId: model.id,
          dataModelKey: model.key,
          recordId: record.id,
          organizationId: model.organizationId,
          actorId: ctx.userId,
          occurredAt: new Date(),
          subscriptionAliases: [perModelEventType(model.key, "created")],
        };
        await emit(event).catch(() => {});

        return serializeRecord(record);
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.string().min(1),
          slug: z.string().trim().min(1).max(60).nullable().optional(),
          data: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const existing = await findDataRecordById(input.id);
        if (!existing) throw new NotFoundError("DataRecord", input.id);
        const model = await requireModelById(existing.dataModelId);
        const orgId = await requireModelAccess(ctx, model, "data-models.record-write");
        // Row-level : can't edit a record your roles can't see.
        const access = await recordAccessContext(ctx.userId, orgId);
        if (!(await isDataRecordRoleAccessible(existing.id, access))) {
          throw new NotFoundError("DataRecord", input.id);
        }

        const updated = await updateDataRecord(input.id, {
          slug: input.slug,
          data: input.data,
        });

        const changed: string[] = [];
        if (input.slug !== undefined && input.slug !== existing.slug) changed.push("slug");
        if (updated.title !== existing.title) changed.push("title");
        if (input.data) changed.push(...Object.keys(input.data));

        if (changed.length > 0) {
          const event: DataModelRecordUpdatedEvent = {
            type: "data-models.record-updated",
            dataModelId: model.id,
            dataModelKey: model.key,
            recordId: updated.id,
            organizationId: model.organizationId,
            actorId: ctx.userId,
            changed,
            occurredAt: new Date(),
            subscriptionAliases: [perModelEventType(model.key, "updated")],
          };
          await emit(event).catch(() => {});
        }

        return serializeRecord(updated);
      }),

    // Bulk edit : apply the same partial `data` overlay to many records at
    // once. Gated by the separate `record-bulk-write` capability *in addition
    // to* per-model `record-write`, so bulk can be granted / revoked apart from
    // single-record editing. The client sends one field's value ; the same
    // overlay is written to every id.
    bulkUpdate: publicProcedure
      .input(
        z.object({
          ids: z.array(z.string().min(1)).min(1).max(BULK_UPDATE_MAX),
          data: z.record(z.string(), z.unknown()),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        if (Object.keys(input.data).length === 0) return { count: 0 };

        // Every target must exist and belong to the same model — a bulk edit
        // is scoped to one Data Model's field set.
        const loaded = await Promise.all(input.ids.map((id) => findDataRecordById(id)));
        const missingIdx = loaded.findIndex((r) => !r);
        if (missingIdx !== -1) throw new NotFoundError("DataRecord", input.ids[missingIdx]!);
        const records = loaded as NonNullable<(typeof loaded)[number]>[];
        if (new Set(records.map((r) => r.dataModelId)).size !== 1) {
          throw new ValidationError(
            "All records in a bulk edit must belong to the same Data Model.",
          );
        }
        const model = await requireModelById(records[0]!.dataModelId);

        // Must be able to write this model's records AND hold the separate
        // bulk-edit capability.
        const orgId = await requireModelAccess(ctx, model, "data-models.record-write");
        await requirePermission(ctx, "data-models.record-bulk-write", orgId);

        // Row-level : can't touch a record your roles can't see.
        const access = await recordAccessContext(ctx.userId, orgId);
        for (const rec of records) {
          if (!(await isDataRecordRoleAccessible(rec.id, access))) {
            throw new NotFoundError("DataRecord", rec.id);
          }
        }

        // Not one transaction — updateDataRecord merges + re-validates +
        // recomputes per row through its own db handle. The value is validated
        // before each row's write, so a type-invalid value fails on the first
        // row with nothing persisted.
        const changed = Object.keys(input.data);
        for (const rec of records) {
          const updated = await updateDataRecord(rec.id, { data: input.data });
          const event: DataModelRecordUpdatedEvent = {
            type: "data-models.record-updated",
            dataModelId: model.id,
            dataModelKey: model.key,
            recordId: updated.id,
            organizationId: model.organizationId,
            actorId: ctx.userId,
            changed,
            occurredAt: new Date(),
            subscriptionAliases: [perModelEventType(model.key, "updated")],
          };
          await emit(event).catch(() => {});
        }

        return { count: records.length };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.string().min(1), hard: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const existing = await findDataRecordById(input.id);
        if (!existing) throw new NotFoundError("DataRecord", input.id);
        const model = await requireModelById(existing.dataModelId);
        const orgId = await requireModelAccess(ctx, model, "data-models.record-delete");
        // Row-level : can't delete a record your roles can't see.
        const access = await recordAccessContext(ctx.userId, orgId);
        if (!(await isDataRecordRoleAccessible(existing.id, access))) {
          throw new NotFoundError("DataRecord", input.id);
        }

        const hard = input.hard ?? false;
        if (hard) {
          await hardDeleteDataRecord(input.id);
        } else {
          await softDeleteDataRecord(input.id);
        }

        const event: DataModelRecordDeletedEvent = {
          type: "data-models.record-deleted",
          dataModelId: model.id,
          dataModelKey: model.key,
          recordId: input.id,
          recordTitle: existing.title,
          organizationId: model.organizationId,
          actorId: ctx.userId,
          hard,
          occurredAt: new Date(),
          subscriptionAliases: [perModelEventType(model.key, "deleted")],
        };
        await emit(event).catch(() => {});
      }),

    restore: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const existing = await findDataRecordById(input.id);
        if (!existing) throw new NotFoundError("DataRecord", input.id);
        const model = await requireModelById(existing.dataModelId);
        // Restore uses record-write, not record-delete — mirrors
        // projects.restore / industries.restore, which gate on the write
        // permission (undoing a delete reads as an edit, not a deletion).
        const orgId = await requireModelAccess(ctx, model, "data-models.record-write");
        const access = await recordAccessContext(ctx.userId, orgId);
        if (!(await isDataRecordRoleAccessible(existing.id, access))) {
          throw new NotFoundError("DataRecord", input.id);
        }
        if (!existing.deletedAt) {
          throw new ValidationError("Data Record is not deleted.");
        }
        await restoreDataRecord(input.id);
      }),

    // ── Row-level access management ──
    // Read/replace the roles allowed to see a record. Empty list = open to
    // everyone who can access the model. Gated on `manage-schema` : deciding
    // record visibility is a data-admin action, not a per-record-write one.
    // Cross-org role ids are inert (their holders still fail the model-level
    // org check), so no extra org validation is needed here.
    getAccess: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const record = await findDataRecordById(input.id);
        if (!record) throw new NotFoundError("DataRecord", input.id);
        const model = await requireModelById(record.dataModelId);
        await requireModelAccess(ctx, model, "data-models.manage-schema");
        return { roleIds: await getDataRecordRoleAccess(record.id) };
      }),

    setAccess: publicProcedure
      .input(z.object({ id: z.string().min(1), roleIds: z.array(z.string().min(1)) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const record = await findDataRecordById(input.id);
        if (!record) throw new NotFoundError("DataRecord", input.id);
        const model = await requireModelById(record.dataModelId);
        await requireModelAccess(ctx, model, "data-models.manage-schema");
        await setDataRecordRoleAccess(record.id, input.roleIds);
        return { roleIds: input.roleIds };
      }),

    // ── Watch (per-record) ──
    // Follow a record : get notified when it changes / is deleted. Gated on
    // record-read + row-level access — you can only watch a record you can see.
    isWatching: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const record = await findDataRecordById(input.id);
        if (!record) throw new NotFoundError("DataRecord", input.id);
        const model = await requireModelById(record.dataModelId);
        const orgId = await requireModelAccess(ctx, model, "data-models.record-read");
        const access = await recordAccessContext(ctx.userId, orgId);
        if (!(await isDataRecordRoleAccessible(record.id, access))) {
          throw new NotFoundError("DataRecord", input.id);
        }
        return { watching: await isWatchingRecord(record.id, ctx.userId) };
      }),

    setWatch: publicProcedure
      .input(z.object({ id: z.string().min(1), watching: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const record = await findDataRecordById(input.id);
        if (!record) throw new NotFoundError("DataRecord", input.id);
        const model = await requireModelById(record.dataModelId);
        const orgId = await requireModelAccess(ctx, model, "data-models.record-read");
        const access = await recordAccessContext(ctx.userId, orgId);
        if (!(await isDataRecordRoleAccessible(record.id, access))) {
          throw new NotFoundError("DataRecord", input.id);
        }
        await setRecordWatch(record.id, ctx.userId, input.watching);
        return { watching: input.watching };
      }),
  }),

  // Saved MonarkQL queries per model (personal, or shared to everyone with
  // read access). Reading a model's views needs record-read ; editing a view is
  // scoped to its owner (a shared view is still only editable by whoever made
  // it). A stale view (a field it references was archived/retyped) simply errors
  // at run time when the compiler rejects it — nothing to migrate.
  views: router({
    list: publicProcedure
      .input(z.object({ dataModelId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const model = await requireModelById(input.dataModelId);
        await requireModelAccess(ctx, model, "data-models.record-read");
        const views = await listDataRecordViews(input.dataModelId, ctx.userId);
        return views.map((v) => serializeView(v, ctx.userId!));
      }),

    create: publicProcedure
      .input(
        z.object({
          dataModelId: z.string().min(1),
          name: z.string().trim().min(1).max(80),
          query: filterQuerySchema,
          shared: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const model = await requireModelById(input.dataModelId);
        const orgId = await requireModelAccess(ctx, model, "data-models.record-read");
        const view = await createDataRecordView({
          dataModelId: input.dataModelId,
          organizationId: orgId,
          name: input.name,
          query: input.query,
          shared: input.shared ?? false,
          createdBy: ctx.userId,
        });
        return serializeView(view, ctx.userId);
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.string().min(1),
          name: z.string().trim().min(1).max(80).optional(),
          query: filterQuerySchema.optional(),
          shared: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        await requireOwnedView(input.id, ctx.userId);
        const updated = await updateDataRecordView(input.id, {
          name: input.name,
          query: input.query,
          shared: input.shared,
        });
        return serializeView(updated, ctx.userId);
      }),

    delete: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        await requireOwnedView(input.id, ctx.userId);
        await deleteDataRecordView(input.id);
        return { id: input.id };
      }),
  }),
});
