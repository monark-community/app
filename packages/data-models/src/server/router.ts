import { z } from "zod";
import { router, publicProcedure } from "@monark/common/trpc";
import { emit, NotFoundError, UnauthorizedError, ValidationError } from "@monark/common";
import { MAX_PAGE_SIZE } from "@monark/common/pagination";
import { requireOrg } from "@monark/organizations/server";
import { requirePermission, type RbacContext } from "@monark/rbac/server";
import { DATA_FIELD_TYPES } from "../contracts/field-types";
import { listModelIntegrations } from "../contracts/integrations";
import { getFieldIndexStatus, requestFieldIndex } from "./indexing";
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
  findFreeDataFieldKey,
  findFreeDataModelKey,
  hardDeleteDataModel,
  hardDeleteDataRecord,
  listDataFields,
  listDataModels,
  listDataRecords,
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
  | "data-models.record-delete";

// Every Data Model is org-scoped : gate on the caller's own org, and 404
// rather than leak the existence of another org's model.
async function requireModelAccess(
  ctx: RbacContext,
  model: DataModelRow,
  permission: DataModelsPermission,
): Promise<void> {
  // Callers only reach here after their own `if (!ctx.userId) throw ...`
  // guard, so this cast is safe — RbacContext types userId nullable because
  // the anonymous case is valid for other callers of requirePermission.
  const org = await requireOrg({
    userId: ctx.userId as string,
    activeOrganizationId: ctx.activeOrganizationId,
  });
  if (model.organizationId !== org.id) {
    throw new NotFoundError("DataModel", model.id);
  }
  await requirePermission(ctx, permission, org.id);
}

async function requireModelById(id: string): Promise<DataModelRow> {
  const model = await findDataModelById(id);
  if (!model) throw new NotFoundError("DataModel", id);
  return model;
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
          titleFieldId: z.string().min(1).nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const existing = await requireModelById(input.id);
        await requireModelAccess(ctx, existing, "data-models.manage-schema");

        if (input.titleFieldId) {
          const field = await findDataFieldById(input.titleFieldId);
          if (!field || field.dataModelId !== existing.id) {
            throw new ValidationError("titleFieldId must reference a field on this Data Model.");
          }
        }

        const updated = await updateDataModel(input.id, {
          name: input.name,
          description: input.description,
          icon: input.icon,
          titleFieldId: input.titleFieldId,
        });

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

        await archiveDataField(input.id);
        if (model.titleFieldId === input.id) {
          // The archived field can no longer back the record title.
          await updateDataModel(model.id, { titleFieldId: null });
        }

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
          ...paginationInput,
        }),
      )
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const model = await requireModelById(input.dataModelId);
        await requireModelAccess(ctx, model, "data-models.record-read");
        const page = await listDataRecords({
          dataModelId: input.dataModelId,
          includeDeleted: input.includeDeleted ?? false,
          search: input.search,
          limit: input.limit,
          cursor: input.cursor,
        });
        return { ...page, items: page.items.map(serializeRecord) };
      }),

    getById: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const record = await findDataRecordById(input.id);
        if (!record) throw new NotFoundError("DataRecord", input.id);
        const model = await requireModelById(record.dataModelId);
        await requireModelAccess(ctx, model, "data-models.record-read");
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
        await requireModelAccess(ctx, model, "data-models.record-write");

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
          };
          await emit(event).catch(() => {});
        }

        return serializeRecord(updated);
      }),

    delete: publicProcedure
      .input(z.object({ id: z.string().min(1), hard: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const existing = await findDataRecordById(input.id);
        if (!existing) throw new NotFoundError("DataRecord", input.id);
        const model = await requireModelById(existing.dataModelId);
        await requireModelAccess(ctx, model, "data-models.record-delete");

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
          organizationId: model.organizationId,
          actorId: ctx.userId,
          hard,
          occurredAt: new Date(),
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
        await requireModelAccess(ctx, model, "data-models.record-write");
        if (!existing.deletedAt) {
          throw new ValidationError("Data Record is not deleted.");
        }
        await restoreDataRecord(input.id);
      }),
  }),
});
