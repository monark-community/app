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
import { checkRateLimit } from "@monark/common/rate-limit";
import { isEnabled } from "@monark/feature-flags/server";
import { renderBrandedEmail, sendMail } from "@monark/notifications/server";
import { BRANDING } from "@monark/branding";
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
import {
  addFormInvite,
  createDataForm,
  createPublicFormRecord,
  findDataFormById,
  findFormEntryById,
  findFormInviteById,
  findFormInviteByToken,
  findLiveDataFormByToken,
  isRecordPublishedForForm,
  listDataForms,
  listFormInvites,
  listPendingEntries,
  listPublicBoardRecords,
  markFormInviteSubmitted,
  projectPublicRecord,
  removeFormInvite,
  setEntryStatus,
  softDeleteDataForm,
  updateDataForm,
  type DataFormEntryRow,
  type DataFormInviteRow,
  type DataFormRow,
} from "./forms";
import {
  commentCountFor,
  createRecordComment,
  getCommentById,
  listRecordComments,
  setCommentHidden,
  softDeleteComment,
  toggleVote,
  voteStateFor,
  type CommentRow,
} from "./engagement";
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
  DataFormEntryPublishedEvent,
  DataFormSubmittedEvent,
  DataRecordCommentedEvent,
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
  | "data-models.record-delete"
  | "data-models.manage-forms";

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

// ── Public form helpers ──────────────────────────────────────
function serializeForm(f: DataFormRow) {
  return {
    id: f.id,
    dataModelId: f.dataModelId,
    name: f.name,
    token: f.token,
    mode: f.mode,
    fieldKeys: f.fieldKeys,
    active: f.active,
    closesAt: f.closesAt,
    intro: f.intro,
    successMessage: f.successMessage,
    listEnabled: f.listEnabled,
    listReadFieldKeys: f.listReadFieldKeys,
    listPublicRead: f.listPublicRead,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}
// Never leak `tokenHash`.
function serializeFormInvite(i: DataFormInviteRow) {
  return {
    id: i.id,
    email: i.email,
    displayName: i.displayName,
    submittedAt: i.submittedAt,
    recordId: i.recordId,
    createdAt: i.createdAt,
  };
}

// Load a form + its model and gate on the manage-forms permission. Anonymous /
// non-authorized callers are turned away here ; the public procedures below do
// NOT use this (they authorize via the form token instead).
async function requireFormAdmin(
  ctx: RbacContext,
  formId: string,
): Promise<{ form: DataFormRow; model: DataModelRow }> {
  if (!ctx.userId) throw new UnauthorizedError();
  const form = await findDataFormById(formId);
  if (!form) throw new NotFoundError("DataForm", formId);
  const model = await requireModelById(form.dataModelId);
  await requireModelAccess(ctx, model, "data-models.manage-forms");
  return { form, model };
}

// Same gate, keyed by a board entry id (moderation actions).
async function requireEntryAdmin(
  ctx: RbacContext,
  entryId: string,
): Promise<{ entry: DataFormEntryRow; form: DataFormRow; model: DataModelRow }> {
  if (!ctx.userId) throw new UnauthorizedError();
  const entry = await findFormEntryById(entryId);
  if (!entry) throw new NotFoundError("DataFormEntry", entryId);
  const { form, model } = await requireFormAdmin(ctx, entry.dataFormId);
  return { entry, form, model };
}

// Public forms are flag-gated ; when off, behave as if the form doesn't exist.
async function assertPublicFormsEnabled(organizationId: string): Promise<void> {
  const on = await isEnabled("data-models.public-forms", { organizationId });
  if (!on) throw new NotFoundError("DataForm", "public-forms-disabled");
}

function formIsClosed(form: DataFormRow): boolean {
  return !form.active || (form.closesAt != null && form.closesAt.getTime() < Date.now());
}

function absoluteFormUrl(appUrl: string | undefined, token: string, key?: string): string {
  const base = (appUrl ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/f/${token}${key ? `?k=${key}` : ""}`;
}

// Resolve a form whose public BOARD (read side) is viewable by this caller :
// live form, flag on, board enabled, and read access satisfied (public-read, or
// a valid invite key). Throws (404/403) otherwise. Used by the public read
// procedures ; submission has its own path.
async function requireReadableBoard(token: string, key?: string): Promise<DataFormRow> {
  const form = await findLiveDataFormByToken(token);
  if (!form) throw new NotFoundError("DataForm", token);
  await assertPublicFormsEnabled(form.organizationId);
  if (!form.listEnabled) throw new NotFoundError("DataForm", token);
  if (!form.listPublicRead) {
    const invite = key ? await findFormInviteByToken(form.id, key) : null;
    if (!invite) throw new ForbiddenError("This board requires a valid invite link.");
  }
  return form;
}

async function requireModelById(id: string): Promise<DataModelRow> {
  const model = await findDataModelById(id);
  if (!model) throw new NotFoundError("DataModel", id);
  return model;
}

// ── Engagement (votes + comments) helpers ────────────────────
// A vote/comment identity is a real principal, never anonymous : a logged-in
// user (`user:<id>`) or a board invite (`invite:<id>`). The optional variant is
// used on read paths (an anonymous viewer just has no "hasVoted") ; the
// required variant gates the vote mutation.
async function resolveVoterKey(
  ctx: RbacContext,
  form: DataFormRow,
  key?: string,
): Promise<string | null> {
  if (ctx.userId) return `user:${ctx.userId}`;
  if (form.mode === "EMAIL" && key) {
    const invite = await findFormInviteByToken(form.id, key);
    if (invite) return `invite:${invite.id}`;
  }
  return null;
}

function serializeComment(c: CommentRow) {
  return {
    id: c.id,
    body: c.body,
    hidden: c.hidden,
    createdAt: c.createdAt,
    authorId: c.authorId,
    authorName: c.author.displayName,
    authorAvatarUrl: c.author.avatarUrl,
  };
}

// Load the board's model and assert the requested engagement feature is on.
// Behaves as "not found" when off, so a disabled feature never leaks structure.
async function requireEngagementModel(
  form: DataFormRow,
  feature: "voting" | "discussions",
): Promise<DataModelRow> {
  const model = await requireModelById(form.dataModelId);
  const on = feature === "voting" ? model.votingEnabled : model.discussionsEnabled;
  if (!on) throw new NotFoundError("DataModel", `${feature}-disabled`);
  return model;
}

// A published record is the only engageable target : gate every vote/comment
// action on it, mirroring the board read guards.
async function requirePublishedRecord(form: DataFormRow, recordId: string): Promise<void> {
  if (!(await isRecordPublishedForForm(form.id, recordId))) {
    throw new NotFoundError("DataRecord", recordId);
  }
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
          votingEnabled: z.boolean().optional(),
          discussionsEnabled: z.boolean().optional(),
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
          votingEnabled: input.votingEnabled,
          discussionsEnabled: input.discussionsEnabled,
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

  // ── Public forms ───────────────────────────────────────────
  // Admin procedures manage a model's shareable forms + email invites ;
  // `public.*` are anonymous, token-authorized submission endpoints.
  forms: router({
    list: publicProcedure
      .input(z.object({ dataModelId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const model = await requireModelById(input.dataModelId);
        await requireModelAccess(ctx, model, "data-models.manage-forms");
        return (await listDataForms(input.dataModelId)).map(serializeForm);
      }),

    create: publicProcedure
      .input(
        z.object({
          dataModelId: z.string().min(1),
          name: z.string().trim().min(1).max(120),
          mode: z.enum(["ANONYMOUS", "EMAIL"]),
          fieldKeys: z.array(z.string().min(1)).max(200),
          closesAt: z.coerce.date().nullable().optional(),
          intro: z.string().max(2000).nullable().optional(),
          successMessage: z.string().max(2000).nullable().optional(),
          listEnabled: z.boolean().optional(),
          listReadFieldKeys: z.array(z.string().min(1)).max(200).optional(),
          listPublicRead: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const model = await requireModelById(input.dataModelId);
        const orgId = await requireModelAccess(ctx, model, "data-models.manage-forms");
        const form = await createDataForm({
          organizationId: orgId,
          dataModelId: input.dataModelId,
          name: input.name,
          mode: input.mode,
          fieldKeys: input.fieldKeys,
          closesAt: input.closesAt ?? null,
          intro: input.intro ?? null,
          successMessage: input.successMessage ?? null,
          listEnabled: input.listEnabled,
          listReadFieldKeys: input.listReadFieldKeys,
          listPublicRead: input.listPublicRead,
          createdBy: ctx.userId,
        });
        return serializeForm(form);
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.string().min(1),
          name: z.string().trim().min(1).max(120).optional(),
          mode: z.enum(["ANONYMOUS", "EMAIL"]).optional(),
          fieldKeys: z.array(z.string().min(1)).max(200).optional(),
          active: z.boolean().optional(),
          closesAt: z.coerce.date().nullable().optional(),
          intro: z.string().max(2000).nullable().optional(),
          successMessage: z.string().max(2000).nullable().optional(),
          listEnabled: z.boolean().optional(),
          listReadFieldKeys: z.array(z.string().min(1)).max(200).optional(),
          listPublicRead: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await requireFormAdmin(ctx, input.id);
        const { id, ...patch } = input;
        return serializeForm(await updateDataForm(id, patch));
      }),

    delete: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        await requireFormAdmin(ctx, input.id);
        await softDeleteDataForm(input.id);
        return { id: input.id };
      }),

    invites: router({
      list: publicProcedure
        .input(z.object({ formId: z.string().min(1) }))
        .query(async ({ ctx, input }) => {
          await requireFormAdmin(ctx, input.formId);
          return (await listFormInvites(input.formId)).map(serializeFormInvite);
        }),

      add: publicProcedure
        .input(
          z.object({
            formId: z.string().min(1),
            email: z.string().trim().email().max(320),
            displayName: z.string().trim().max(120).optional(),
            appUrl: z.string().url().optional(),
          }),
        )
        .mutation(async ({ ctx, input }) => {
          const { form, model } = await requireFormAdmin(ctx, input.formId);
          if (form.mode !== "EMAIL") {
            throw new ValidationError("Only EMAIL-mode forms can invite recipients.");
          }
          const { plaintext, invite } = await addFormInvite({
            dataFormId: form.id,
            email: input.email,
            displayName: input.displayName ?? null,
          });
          const link = absoluteFormUrl(input.appUrl, form.token, plaintext);
          const inviteSubject = `You're invited to submit "${form.name}"`;
          await sendMail({
            to: invite.email,
            subject: inviteSubject,
            text: `You've been invited to fill out the form "${form.name}" for ${model.name} on ${BRANDING.appName}.

Open your personal form link:
${link}

This link is unique to you and can be submitted once.`,
            // Shared branded shell : same reason as the org invite —
            // the recipient has no account, so `notify()` can't address
            // them, but the email should still carry the org's identity.
            html: await renderBrandedEmail({
              subject: inviteSubject,
              bodyHtml: `<p style="margin:0 0 12px 0;font-size:16px;color:#18181b;">You've been invited to fill out <strong>${form.name}</strong> on <strong>${BRANDING.appName}</strong>.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;"><tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;"><a href="${link}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:{{ onBrandPrimary }};text-decoration:none;border-radius:8px;">Open the form</a></td></tr></table>
<p style="margin:0;color:#a1a1aa;font-size:12px;">This link is unique to you and can be submitted once.</p>`,
            }),
          }).catch(() => {});
          return serializeFormInvite(invite);
        }),

      remove: publicProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
          if (!ctx.userId) throw new UnauthorizedError();
          const invite = await findFormInviteById(input.id);
          if (!invite) throw new NotFoundError("DataFormInvite", input.id);
          await requireFormAdmin(ctx, invite.dataFormId);
          await removeFormInvite(input.id);
          return { id: input.id };
        }),
    }),

    // ── Board moderation (admin) ──────────────────────────────
    entries: router({
      pending: publicProcedure
        .input(z.object({ formId: z.string().min(1) }))
        .query(async ({ ctx, input }) => {
          const { form } = await requireFormAdmin(ctx, input.formId);
          const entries = await listPendingEntries(form.id);
          const reviewKeys = [...new Set([...form.fieldKeys, ...form.listReadFieldKeys])];
          const records = await Promise.all(entries.map((e) => findDataRecordById(e.recordId)));
          return entries.map((e, i) => {
            const rec = records[i];
            return {
              id: e.id,
              recordId: e.recordId,
              submitterEmail: e.submitterEmail,
              createdAt: e.createdAt,
              title: rec?.title ?? "",
              data: rec ? projectPublicRecord(rec, reviewKeys).data : {},
            };
          });
        }),

      publish: publicProcedure
        .input(z.object({ entryId: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
          const { entry, form, model } = await requireEntryAdmin(ctx, input.entryId);
          const updated = await setEntryStatus(entry.id, "PUBLISHED", ctx.userId as string);
          const event: DataFormEntryPublishedEvent = {
            type: "data-models.form-entry-published",
            dataModelId: form.dataModelId,
            dataModelKey: model.key,
            recordId: entry.recordId,
            formId: form.id,
            organizationId: form.organizationId,
            occurredAt: new Date(),
          };
          await emit(event).catch(() => {});
          return { id: updated.id, status: updated.status };
        }),

      reject: publicProcedure
        .input(z.object({ entryId: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
          const { entry } = await requireEntryAdmin(ctx, input.entryId);
          const updated = await setEntryStatus(entry.id, "REJECTED", ctx.userId as string);
          return { id: updated.id, status: updated.status };
        }),
    }),

    // ── Anonymous, token-authorized submission surface ────────
    public: router({
      get: publicProcedure
        .input(z.object({ token: z.string().min(1), key: z.string().min(1).optional() }))
        .query(async ({ input }) => {
          const form = await findLiveDataFormByToken(input.token);
          if (!form) throw new NotFoundError("DataForm", input.token);
          await assertPublicFormsEnabled(form.organizationId);
          const model = await requireModelById(form.dataModelId);

          const invite =
            form.mode === "EMAIL" && input.key
              ? await findFormInviteByToken(form.id, input.key)
              : null;
          let state: "open" | "closed" | "submitted" | "invalid" = formIsClosed(form)
            ? "closed"
            : "open";
          let prefillEmail: string | null = null;
          if (form.mode === "EMAIL") {
            if (!invite) state = "invalid";
            else {
              prefillEmail = invite.email;
              if (invite.submittedAt) state = "submitted";
            }
          }

          const byKey = new Map((await listDataFields(form.dataModelId)).map((f) => [f.key, f]));
          const serializeKeys = (keys: string[]) =>
            keys
              .map((k) => byKey.get(k))
              .filter((f): f is DataFieldRow => !!f)
              .map(serializeField);

          // Read-side (board) access is separate from submit : anyone can browse
          // a public-read board ; an invite-gated one needs a valid key.
          const canRead = form.listEnabled && (form.listPublicRead || invite != null);

          return {
            name: form.name,
            intro: form.intro,
            successMessage: form.successMessage,
            mode: form.mode,
            modelName: model.name,
            state,
            prefillEmail,
            fields: serializeKeys(form.fieldKeys),
            listEnabled: form.listEnabled,
            canRead,
            readFields: serializeKeys(form.listReadFieldKeys),
            votingEnabled: model.votingEnabled,
            discussionsEnabled: model.discussionsEnabled,
          };
        }),

      submit: publicProcedure
        .input(
          z.object({
            token: z.string().min(1),
            key: z.string().min(1).optional(),
            data: z.record(z.string(), z.unknown()),
          }),
        )
        .mutation(async ({ ctx, input }) => {
          const form = await findLiveDataFormByToken(input.token);
          if (!form) throw new NotFoundError("DataForm", input.token);
          await assertPublicFormsEnabled(form.organizationId);
          if (formIsClosed(form)) throw new ValidationError("This form is closed.");

          // Throttle by IP + form so an open anonymous link can't be flooded.
          const rl = await checkRateLimit(`public-form:${form.id}:${ctx.clientIp ?? "unknown"}`, {
            refillPerSecond: 0.2,
            burst: 5,
          });
          if (!rl.allowed) throw new ValidationError("Too many submissions — please slow down.");

          let invite: DataFormInviteRow | null = null;
          if (form.mode === "EMAIL") {
            invite = input.key ? await findFormInviteByToken(form.id, input.key) : null;
            if (!invite) throw new ForbiddenError("This form requires a valid invite link.");
            if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
              throw new ForbiddenError("This invite link has expired.");
            }
            if (invite.submittedAt)
              throw new ValidationError("You have already submitted this form.");
          }

          const model = await requireModelById(form.dataModelId);
          const record = await createPublicFormRecord({
            form,
            data: input.data,
            submitterEmail: invite?.email ?? null,
          });
          if (invite) await markFormInviteSubmitted(invite.id, record.id);

          const actorId = `public-form:${form.id}`;
          const created: DataModelRecordCreatedEvent = {
            type: "data-models.record-created",
            dataModelId: form.dataModelId,
            dataModelKey: model.key,
            recordId: record.id,
            organizationId: form.organizationId,
            actorId,
            occurredAt: new Date(),
            subscriptionAliases: [perModelEventType(model.key, "created")],
          };
          const submitted: DataFormSubmittedEvent = {
            type: "data-models.form-submitted",
            dataModelId: form.dataModelId,
            dataModelKey: model.key,
            recordId: record.id,
            formId: form.id,
            mode: form.mode === "EMAIL" ? "email" : "anonymous",
            submitterEmail: invite?.email ?? null,
            organizationId: form.organizationId,
            occurredAt: new Date(),
          };
          await emit(created).catch(() => {});
          await emit(submitted).catch(() => {});

          return { ok: true as const, successMessage: form.successMessage };
        }),

      // Searchable public board : PUBLISHED entries only, projected to the
      // board's read fields. Read-access gated ; lightly rate-limited.
      list: publicProcedure
        .input(
          z.object({
            token: z.string().min(1),
            key: z.string().min(1).optional(),
            search: z.string().trim().max(200).optional(),
            sort: z.enum(["recent", "top"]).optional(),
            limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
            cursor: z.string().min(1).nullish(),
          }),
        )
        .query(async ({ ctx, input }) => {
          const form = await requireReadableBoard(input.token, input.key);
          const rl = await checkRateLimit(`public-board:${form.id}:${ctx.clientIp ?? "unknown"}`, {
            refillPerSecond: 2,
            burst: 30,
          });
          if (!rl.allowed) throw new ValidationError("Too many requests — please slow down.");
          const model = await requireModelById(form.dataModelId);
          const page = await listPublicBoardRecords(form, {
            search: input.search,
            sort: input.sort,
            limit: input.limit,
            cursor: input.cursor,
          });
          // Batched engagement counts for the page (no N+1) ; hasVoted is keyed
          // to this caller's identity (logged-in user or invite), false anon.
          const ids = page.items.map((it) => it.id);
          const voterKey = await resolveVoterKey(ctx, form, input.key);
          const votes = model.votingEnabled ? await voteStateFor(ids, voterKey) : {};
          const comments = model.discussionsEnabled ? await commentCountFor(ids) : {};
          return {
            ...page,
            votingEnabled: model.votingEnabled,
            discussionsEnabled: model.discussionsEnabled,
            items: page.items.map((it) => ({
              ...it,
              voteCount: votes[it.id]?.count ?? 0,
              hasVoted: votes[it.id]?.hasVoted ?? false,
              commentCount: comments[it.id] ?? 0,
            })),
          };
        }),

      record: publicProcedure
        .input(
          z.object({
            token: z.string().min(1),
            key: z.string().min(1).optional(),
            recordId: z.string().min(1),
          }),
        )
        .query(async ({ ctx, input }) => {
          const form = await requireReadableBoard(input.token, input.key);
          if (!(await isRecordPublishedForForm(form.id, input.recordId))) {
            throw new NotFoundError("DataRecord", input.recordId);
          }
          const record = await findDataRecordById(input.recordId);
          if (!record || record.deletedAt) throw new NotFoundError("DataRecord", input.recordId);
          const model = await requireModelById(form.dataModelId);
          const byKey = new Map((await listDataFields(form.dataModelId)).map((f) => [f.key, f]));
          const readFields = form.listReadFieldKeys
            .map((k) => byKey.get(k))
            .filter((f): f is DataFieldRow => !!f)
            .map(serializeField);
          const voterKey = await resolveVoterKey(ctx, form, input.key);
          const votes = model.votingEnabled
            ? (await voteStateFor([record.id], voterKey))[record.id]
            : undefined;
          const commentCount = model.discussionsEnabled
            ? (await commentCountFor([record.id]))[record.id]
            : undefined;
          return {
            modelName: model.name,
            readFields,
            entry: projectPublicRecord(record, form.listReadFieldKeys),
            votingEnabled: model.votingEnabled,
            discussionsEnabled: model.discussionsEnabled,
            voteCount: votes?.count ?? 0,
            hasVoted: votes?.hasVoted ?? false,
            commentCount: commentCount ?? 0,
          };
        }),

      // Toggle the caller's vote on a published board record. Requires the
      // model's votingEnabled + a real identity (login or invite).
      vote: publicProcedure
        .input(
          z.object({
            token: z.string().min(1),
            key: z.string().min(1).optional(),
            recordId: z.string().min(1),
          }),
        )
        .mutation(async ({ ctx, input }) => {
          const form = await requireReadableBoard(input.token, input.key);
          await requireEngagementModel(form, "voting");
          await requirePublishedRecord(form, input.recordId);
          const voterKey = await resolveVoterKey(ctx, form, input.key);
          if (!voterKey) {
            throw new ForbiddenError("Sign in or open your invite link to vote.");
          }
          const rl = await checkRateLimit(`public-vote:${form.id}:${ctx.clientIp ?? "unknown"}`, {
            refillPerSecond: 1,
            burst: 20,
          });
          if (!rl.allowed) throw new ValidationError("Too many requests — please slow down.");
          const result = await toggleVote(input.recordId, voterKey, ctx.userId ?? null);
          return { count: result.count, hasVoted: result.voted };
        }),

      // The caller's own vote state for one record. Used by the detail page,
      // whose initial load is server-anonymous (so its `hasVoted` is unknown) ;
      // this client query carries the session/invite and reconciles it.
      voteState: publicProcedure
        .input(
          z.object({
            token: z.string().min(1),
            key: z.string().min(1).optional(),
            recordId: z.string().min(1),
          }),
        )
        .query(async ({ ctx, input }) => {
          const form = await requireReadableBoard(input.token, input.key);
          await requirePublishedRecord(form, input.recordId);
          const voterKey = await resolveVoterKey(ctx, form, input.key);
          const state = (await voteStateFor([input.recordId], voterKey))[input.recordId];
          return { count: state?.count ?? 0, hasVoted: state?.hasVoted ?? false };
        }),

      // Whether the current (logged-in) caller may moderate this board's
      // comments (hide / delete any). Non-throwing : anonymous or non-admin
      // callers get `false`, so the board UI can decide what to render.
      canModerate: publicProcedure
        .input(z.object({ token: z.string().min(1) }))
        .query(async ({ ctx, input }) => {
          if (!ctx.userId) return { canModerate: false };
          const form = await findLiveDataFormByToken(input.token);
          if (!form) return { canModerate: false };
          const model = await requireModelById(form.dataModelId);
          try {
            await requireModelAccess(ctx, model, "data-models.manage-forms");
            return { canModerate: true };
          } catch {
            return { canModerate: false };
          }
        }),

      comments: router({
        list: publicProcedure
          .input(
            z.object({
              token: z.string().min(1),
              key: z.string().min(1).optional(),
              recordId: z.string().min(1),
              limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
              cursor: z.string().min(1).nullish(),
            }),
          )
          .query(async ({ ctx, input }) => {
            const form = await requireReadableBoard(input.token, input.key);
            await requireEngagementModel(form, "discussions");
            await requirePublishedRecord(form, input.recordId);
            // Moderators see hidden comments (flagged, so they can unhide) ;
            // the public list never returns them.
            let includeHidden = false;
            if (ctx.userId) {
              const model = await requireModelById(form.dataModelId);
              try {
                await requireModelAccess(ctx, model, "data-models.manage-forms");
                includeHidden = true;
              } catch {
                includeHidden = false;
              }
            }
            const page = await listRecordComments(input.recordId, {
              limit: input.limit,
              cursor: input.cursor,
              includeHidden,
            });
            return { ...page, items: page.items.map(serializeComment) };
          }),

        // User-only : a logged-in User authors an auto-published comment.
        // No invite / anonymous path (unlike voting).
        post: publicProcedure
          .input(
            z.object({
              token: z.string().min(1),
              recordId: z.string().min(1),
              body: z.string().min(1).max(4000),
            }),
          )
          .mutation(async ({ ctx, input }) => {
            if (!ctx.userId) throw new UnauthorizedError();
            const form = await requireReadableBoard(input.token);
            const model = await requireEngagementModel(form, "discussions");
            await requirePublishedRecord(form, input.recordId);
            const rl = await checkRateLimit(`public-comment:${form.id}:${ctx.userId}`, {
              refillPerSecond: 0.5,
              burst: 10,
            });
            if (!rl.allowed) throw new ValidationError("Too many comments — please slow down.");
            const comment = await createRecordComment(input.recordId, ctx.userId, input.body);
            const event: DataRecordCommentedEvent = {
              type: "data-models.record-commented",
              dataModelId: form.dataModelId,
              dataModelKey: model.key,
              recordId: input.recordId,
              commentId: comment.id,
              authorId: ctx.userId,
              organizationId: form.organizationId,
              occurredAt: new Date(),
            };
            await emit(event).catch(() => {});
            return serializeComment(comment);
          }),

        // Soft delete : the comment's author, or a board admin (manage-forms).
        remove: publicProcedure
          .input(z.object({ token: z.string().min(1), commentId: z.string().min(1) }))
          .mutation(async ({ ctx, input }) => {
            if (!ctx.userId) throw new UnauthorizedError();
            const form = await requireReadableBoard(input.token);
            const comment = await getCommentById(input.commentId);
            if (!comment) throw new NotFoundError("DataRecordComment", input.commentId);
            await requirePublishedRecord(form, comment.dataRecordId);
            const isAuthor = comment.authorId === ctx.userId;
            if (!isAuthor) await requireFormAdmin(ctx, form.id);
            await softDeleteComment(input.commentId);
            return { ok: true as const };
          }),

        // Moderation : hide / unhide a comment. Board admin only (manage-forms).
        setHidden: publicProcedure
          .input(
            z.object({
              token: z.string().min(1),
              commentId: z.string().min(1),
              hidden: z.boolean(),
            }),
          )
          .mutation(async ({ ctx, input }) => {
            if (!ctx.userId) throw new UnauthorizedError();
            const form = await requireReadableBoard(input.token);
            await requireFormAdmin(ctx, form.id);
            const comment = await getCommentById(input.commentId);
            if (!comment) throw new NotFoundError("DataRecordComment", input.commentId);
            await requirePublishedRecord(form, comment.dataRecordId);
            await setCommentHidden(input.commentId, input.hidden);
            return { ok: true as const };
          }),
      }),
    }),
  }),
});
