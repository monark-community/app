import { z } from "zod";
import { BRANDING } from "@monark/branding";
import type { RouteDescriptor } from "@monark/public-api/server";
import type { AppCaller } from "./caller";

// The v1 public REST surface, declared as descriptors. Each maps an HTTP route
// to one (or a couple of) tRPC procedure calls through the server-side caller.
// Authority is 100% RBAC : the underlying procedure enforces the permission,
// resolved against the key's PRINCIPAL (a user, or a service account with its
// own roles). `permission` here is documentation only — surfaced in OpenAPI so
// a client knows which role a key's principal needs. Handlers receive
// already-validated `query` / `body` (parsed by the mount against the schemas).

const listQuery = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  cursor: z.string().optional(),
  search: z.string().trim().max(120).optional(),
});
type ListQuery = z.infer<typeof listQuery>;

const recordCreateBody = z.object({
  slug: z.string().trim().min(1).max(60).nullable().optional(),
  data: z.record(z.string(), z.unknown()),
});
type RecordCreateBody = z.infer<typeof recordCreateBody>;

const recordUpdateBody = z.object({
  slug: z.string().trim().min(1).max(60).nullable().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
type RecordUpdateBody = z.infer<typeof recordUpdateBody>;

const deleteQuery = z.object({ hard: z.coerce.boolean().optional() });
type DeleteQuery = z.infer<typeof deleteQuery>;

// Resolve a Data Model's cuid from its org-unique key (records procedures take
// the id). `getByKey` is org-scoped + permission-gated, so a bad key / no
// access surfaces as the same 404 / 403 the web app would return.
async function resolveModelId(caller: AppCaller, key: string): Promise<string> {
  const model = await caller.dataModels.models.getByKey({ key });
  return model.id;
}

export const V1_ROUTES: RouteDescriptor<AppCaller>[] = [
  {
    method: "get",
    path: "/me",
    summary: "Identity and organization of the authenticated API key's principal.",
    tags: ["meta"],
    mcp: {
      expose: {
        name: "monark_whoami",
        description:
          "Return the identity and organization this API key acts as. Call this first to confirm the connection works and to learn which organization you're operating in.",
      },
    },
    handler: async ({ principal }) => ({
      userId: principal.userId,
      organizationId: principal.organizationId,
    }),
  },
  {
    method: "get",
    path: "/models",
    summary: "List the organization's Data Models.",
    permission: "data-models.read-schema",
    tags: ["data-models"],
    mcp: {
      expose: {
        name: "monark_list_models",
        description: `List the organization's Data Models. Everything in ${BRANDING.appName} — projects, tasks, and any custom entity — is a Data Model ; start here to discover what data exists, then use its \`key\` with the record tools.`,
      },
    },
    request: { query: listQuery },
    handler: async ({ caller, query }) => caller.dataModels.models.list(query as ListQuery),
  },
  {
    method: "get",
    path: "/models/:key",
    summary: "Fetch one Data Model by its key.",
    permission: "data-models.read-schema",
    tags: ["data-models"],
    mcp: { expose: { name: "monark_get_model", description: "Fetch one Data Model by its key." } },
    handler: async ({ caller, params }) =>
      caller.dataModels.models.getByKey({ key: params.key ?? "" }),
  },
  {
    method: "get",
    path: "/models/:key/fields",
    summary: "List a Data Model's field definitions.",
    permission: "data-models.read-schema",
    tags: ["data-models"],
    mcp: {
      expose: {
        name: "monark_list_model_fields",
        description:
          "List a Data Model's field definitions (key, label, type). Use this to learn what fields exist before reading or writing records.",
      },
    },
    handler: async ({ caller, params }) => {
      const dataModelId = await resolveModelId(caller, params.key ?? "");
      return caller.dataModels.fields.list({ dataModelId });
    },
  },
  {
    method: "get",
    path: "/models/:key/records",
    summary: "List records in a Data Model (cursor-paginated).",
    permission: "data-models.record-read",
    tags: ["records"],
    mcp: {
      expose: {
        name: "monark_list_records",
        description: "List records in a Data Model (cursor-paginated). Optionally filter by text.",
      },
    },
    request: { query: listQuery },
    handler: async ({ caller, params, query }) => {
      const dataModelId = await resolveModelId(caller, params.key ?? "");
      const q = query as ListQuery;
      return caller.dataModels.records.list({
        dataModelId,
        search: q.search,
        limit: q.limit,
        cursor: q.cursor,
      });
    },
  },
  {
    method: "post",
    path: "/models/:key/records",
    summary: "Create a record in a Data Model.",
    permission: "data-models.record-write",
    tags: ["records"],
    mcp: {
      expose: {
        name: "monark_create_record",
        description:
          "Create a record in a Data Model. Provide `data` as field-key → value. Check the model's fields first if unsure of the keys.",
      },
    },
    request: { body: recordCreateBody },
    handler: async ({ caller, params, body }) => {
      const dataModelId = await resolveModelId(caller, params.key ?? "");
      const b = body as RecordCreateBody;
      return caller.dataModels.records.create({ dataModelId, slug: b.slug, data: b.data });
    },
  },
  {
    method: "get",
    path: "/records/:id",
    summary: "Fetch one record by id.",
    permission: "data-models.record-read",
    tags: ["records"],
    mcp: { expose: { name: "monark_get_record", description: "Fetch one record by its id." } },
    handler: async ({ caller, params }) =>
      caller.dataModels.records.getById({ id: params.id ?? "" }),
  },
  {
    method: "patch",
    path: "/records/:id",
    summary: "Update a record's fields.",
    permission: "data-models.record-write",
    tags: ["records"],
    mcp: {
      expose: {
        name: "monark_update_record",
        description:
          "Update a record's fields. Only the fields you include in `data` are changed ; others are left as-is.",
      },
    },
    request: { body: recordUpdateBody },
    handler: async ({ caller, params, body }) => {
      const b = body as RecordUpdateBody;
      return caller.dataModels.records.update({ id: params.id ?? "", slug: b.slug, data: b.data });
    },
  },
  {
    method: "delete",
    path: "/records/:id",
    summary: "Delete a record (soft by default, `?hard=true` to purge).",
    permission: "data-models.record-delete",
    tags: ["records"],
    mcp: {
      expose: {
        name: "monark_delete_record",
        description:
          "Delete a record. By default this is a soft delete (recoverable) ; pass hard=true to purge permanently.",
      },
    },
    request: { query: deleteQuery },
    handler: async ({ caller, params, query }) => {
      const q = query as DeleteQuery;
      await caller.dataModels.records.delete({ id: params.id ?? "", hard: q.hard });
      return { ok: true };
    },
  },
];
