import { z } from "zod";
import {
  buildCompileFields,
  createDataRecord,
  findDataModelByKey,
  findDataRecordById,
  hardDeleteDataRecord,
  isDataRecordRoleAccessible,
  listDataFields,
  listDataRecordsWithQuery,
  softDeleteDataRecord,
  updateDataRecord,
} from "@monark/data-models/server";
import { fieldFiltersToFilterNode } from "@monark/data-models/contracts";
import { getUserRoles, hasPermission } from "@monark/rbac/server";
import type { NodeExecutionContext } from "../registry";
import { defineNode } from "../registry";
import { parseJsonObject, requireOwnerPermission } from "./shared";

/**
 * Resolve a record by id and assert the automation's OWNER may act on it: it
 * must belong to the run's org AND be visible to the owner's roles (a data admin
 * with `manage-schema` bypasses row-level access). Mirrors the tRPC records
 * router's `requireModelAccess` + `isDataRecordRoleAccessible` so a node can't
 * reach a record the owner couldn't through the UI (cross-org or row-restricted).
 * Throws a not-found-style error (no existence leak) when the check fails.
 */
async function requireOwnerAccessibleRecord(
  ctx: NodeExecutionContext,
  ownerId: string,
  recordId: string,
): Promise<void> {
  const record = await findDataRecordById(recordId);
  if (!record || record.organizationId !== ctx.organizationId) {
    throw new Error(`Record "${recordId}" not found in this org.`);
  }
  const [roles, bypass] = await Promise.all([
    getUserRoles(ownerId, ctx.organizationId),
    hasPermission(ownerId, "data-models.manage-schema", ctx.organizationId),
  ]);
  const accessible = await isDataRecordRoleAccessible(recordId, {
    roleIds: roles.map((r) => r.id),
    bypass,
  });
  if (!accessible) {
    throw new Error(`Record "${recordId}" is not accessible to this automation.`);
  }
}

/** Create a Data Record in a model (by key), from a JSON payload. */
export const dataCreateRecordNode = defineNode({
  descriptor: {
    kind: "action",
    category: "data",
    label: "Create Record",
    description: "Create a Data Record in a model.",
    icon: "DatabasePlus",
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "recordId", type: "string", description: "The id of the created record." },
    ],
    configFields: [
      { key: "modelKey", label: "Model", type: "data-model", required: true },
      {
        key: "data",
        label: "Data (JSON)",
        type: "json",
        required: true,
        linkable: true,
        help: 'Field values keyed by field key, e.g. {"title": "{{ trigger.name }}"}. Or wire an upstream node into this input.',
      },
    ],
  },
  configSchema: z.object({ modelKey: z.string().min(1), data: z.unknown() }),
  execute: async (ctx, config) => {
    const actorId = await requireOwnerPermission(ctx, "data-models.record-write");
    const model = await findDataModelByKey(ctx.organizationId, config.modelKey);
    if (!model) throw new Error(`No Data Model with key "${config.modelKey}" in this org.`);
    const data = parseJsonObject(config.data, "Data");
    ctx.log(`Creating a "${model.name}" record with ${Object.keys(data).length} field(s).`);
    const record = await createDataRecord({ dataModelId: model.id, data, createdBy: actorId });
    ctx.log(`Created record ${record.id}.`);
    return { recordId: record.id };
  },
});

/** Update a Data Record by id, overlaying a partial JSON payload. */
export const dataUpdateRecordNode = defineNode({
  descriptor: {
    kind: "action",
    category: "data",
    label: "Update Record",
    description: "Update a Data Record by id.",
    icon: "DatabasePen",
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "recordId", type: "string", description: "The id of the updated record." },
    ],
    configFields: [
      { key: "recordId", label: "Record id", type: "text", required: true },
      { key: "data", label: "Patch (JSON)", type: "json", required: true, linkable: true },
    ],
  },
  configSchema: z.object({ recordId: z.string().min(1), data: z.unknown() }),
  execute: async (ctx, config) => {
    const ownerId = await requireOwnerPermission(ctx, "data-models.record-write");
    await requireOwnerAccessibleRecord(ctx, ownerId, config.recordId);
    const data = parseJsonObject(config.data, "Patch");
    ctx.log(`Updating record ${config.recordId} (${Object.keys(data).length} field(s)).`);
    const record = await updateDataRecord(config.recordId, { data });
    ctx.log(`Updated record ${record.id}.`);
    return { recordId: record.id };
  },
});

/** Delete a Data Record by id (soft by default, hard when `hard` is on). */
export const dataDeleteRecordNode = defineNode({
  descriptor: {
    kind: "action",
    category: "data",
    label: "Delete Record",
    description: "Soft- or hard-delete a Data Record by id.",
    icon: "DatabaseX",
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "recordId", type: "string", description: "The id of the deleted record." },
      { key: "deleted", type: "boolean", description: "Whether the delete succeeded." },
      { key: "hard", type: "boolean", description: "True for a hard delete." },
    ],
    configFields: [
      { key: "recordId", label: "Record id", type: "text", required: true },
      { key: "hard", label: "Hard delete", type: "boolean", help: "Permanently remove the row." },
    ],
  },
  configSchema: z.object({ recordId: z.string().min(1), hard: z.boolean().optional() }),
  execute: async (ctx, config) => {
    const ownerId = await requireOwnerPermission(ctx, "data-models.record-delete");
    await requireOwnerAccessibleRecord(ctx, ownerId, config.recordId);
    ctx.log(`${config.hard ? "Hard" : "Soft"}-deleting record ${config.recordId}.`);
    if (config.hard) await hardDeleteDataRecord(config.recordId);
    else await softDeleteDataRecord(config.recordId);
    return { recordId: config.recordId, deleted: true, hard: config.hard ?? false };
  },
});

const MATCH_TO_FILTER_TYPE = {
  contains: "text",
  equals: "select",
  number: "number",
  boolean: "boolean",
} as const;
type MatchOp = keyof typeof MATCH_TO_FILTER_TYPE;

/**
 * Find Data Records in a model matching a single field predicate. Respects the
 * owner's row-level access (records the owner can't see are excluded unless the
 * owner is a data admin). The matching records are exposed for downstream nodes.
 */
export const dataFindRecordsNode = defineNode({
  descriptor: {
    kind: "action",
    category: "data",
    label: "Find Records",
    description: "Query records in a model by a field filter.",
    icon: "DatabaseSearch",
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "count", type: "number", description: "Total matching records." },
      {
        key: "records",
        type: "object",
        description: "The matched records (id, title, slug, data).",
      },
    ],
    configFields: [
      { key: "modelKey", label: "Model", type: "data-model", required: true },
      { key: "field", label: "Field key", type: "text", required: true, placeholder: "status" },
      {
        key: "match",
        label: "Match",
        type: "select",
        required: true,
        options: [
          { value: "contains", label: "contains (text)" },
          { value: "equals", label: "equals (exact)" },
          { value: "number", label: "equals (number)" },
          { value: "boolean", label: "equals (boolean)" },
        ],
      },
      { key: "value", label: "Value", type: "text", required: true },
      { key: "limit", label: "Max results", type: "number" },
    ],
  },
  configSchema: z.object({
    modelKey: z.string().min(1),
    field: z.string().min(1),
    match: z.enum(["contains", "equals", "number", "boolean"]),
    value: z.string(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
  execute: async (ctx, config) => {
    const ownerId = await requireOwnerPermission(ctx, "data-models.record-read");
    const model = await findDataModelByKey(ctx.organizationId, config.modelKey);
    if (!model) throw new Error(`No Data Model with key "${config.modelKey}" in this org.`);
    // Row-level access: a data admin (manage-schema) bypasses ; otherwise the
    // owner's roles gate which records are visible.
    const [roles, isAdmin] = await Promise.all([
      getUserRoles(ownerId, ctx.organizationId),
      hasPermission(ownerId, "data-models.manage-schema", ctx.organizationId),
    ]);
    ctx.log(`Querying "${model.name}" where ${config.field} ${config.match} "${config.value}".`);
    // The node's simple match vocabulary maps onto the same legacy filter shape
    // the list menu uses, then through the one translator into a query tree, so
    // this node and the records list agree on what a predicate means.
    const filter = fieldFiltersToFilterNode([
      {
        key: config.field,
        type: MATCH_TO_FILTER_TYPE[config.match as MatchOp],
        value: config.value,
      },
    ]);
    if (!filter) throw new Error(`The value for "${config.field}" is empty, so nothing to match.`);
    const fields = await listDataFields(model.id);
    const page = await listDataRecordsWithQuery({
      dataModelId: model.id,
      filter,
      fields: buildCompileFields(fields),
      queryContext: { userId: ownerId, now: new Date() },
      roleIds: roles.map((r) => r.id),
      bypassRoleAccess: isAdmin,
      limit: config.limit ?? 10,
    });
    ctx.log(`Matched ${page.total} record(s), returning ${page.items.length}.`);
    return {
      count: page.total,
      records: page.items.map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        data: r.data as Record<string, unknown>,
      })),
    };
  },
});

/** Look up a Data Record by id ; its data is exposed for downstream nodes. */
export const dataFindRecordNode = defineNode({
  descriptor: {
    kind: "action",
    category: "data",
    label: "Find Record",
    description: "Fetch a Data Record by id.",
    icon: "DatabaseSearch",
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "id", type: "string", description: "The record's id." },
      { key: "title", type: "string", description: "The record's title." },
      { key: "slug", type: "string", description: "The record's slug." },
      { key: "data", type: "object", description: "The record's field values." },
    ],
    configFields: [{ key: "recordId", label: "Record id", type: "text", required: true }],
  },
  configSchema: z.object({ recordId: z.string().min(1) }),
  execute: async (ctx, config) => {
    await requireOwnerPermission(ctx, "data-models.record-read");
    const record = await findDataRecordById(config.recordId);
    if (!record || record.organizationId !== ctx.organizationId) {
      throw new Error(`Record "${config.recordId}" not found in this org.`);
    }
    return {
      id: record.id,
      title: record.title,
      slug: record.slug,
      data: record.data as Record<string, unknown>,
    };
  },
});
