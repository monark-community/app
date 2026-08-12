import { createHash, randomBytes } from "node:crypto";
import { NotFoundError, ValidationError } from "@monark/common";
import type { Paginated, PaginationArgs } from "@monark/common/pagination";
import { resolveLimit } from "@monark/common/pagination";
import { getDb, type Prisma } from "@monark/db";
import { isPublicFormFieldType, TITLE_FIELD_KEY } from "../contracts/field-types";
import {
  createDataRecord,
  listDataFields,
  listDataRecords,
  recordDataSchema,
  type DataFieldRow,
  type DataRecordRow,
} from "./data";

export type DataFormEntryRow = Prisma.DataFormEntryGetPayload<Record<string, never>>;
export type DataFormEntryStatus = DataFormEntryRow["status"];

export type DataFormRow = Prisma.DataFormGetPayload<Record<string, never>>;
export type DataFormInviteRow = Prisma.DataFormInviteGetPayload<Record<string, never>>;
export type DataFormMode = DataFormRow["mode"];

// ── Token helpers ────────────────────────────────────────────
// The public form URL slug is a *capability* — unguessable but not secret
// (anyone with the link can open an anonymous form), stored plaintext.
function generatePublicToken(): string {
  return randomBytes(12).toString("base64url"); // ~16 url-safe chars
}
// Per-recipient invite key : secret, SHA-256-hashed at rest (plaintext only in
// the emailed link), same shape as Invite.tokenHash.
function generateInviteToken(): { plaintext: string; hash: string } {
  const plaintext = randomBytes(32).toString("hex");
  return { plaintext, hash: hashToken(plaintext) };
}
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ── Field-selection validation ───────────────────────────────
// A form may only expose simple, public-safe field types, and MUST include
// every required field (except the reserved `title`, which is auto-generated
// when omitted) — otherwise the eventual `createDataRecord` would reject the
// submission for a missing required value the public can't provide.
export async function assertFormFieldsValid(
  dataModelId: string,
  fieldKeys: string[],
): Promise<void> {
  const fields = await listDataFields(dataModelId); // active only
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const seen = new Set<string>();
  for (const key of fieldKeys) {
    if (seen.has(key)) throw new ValidationError(`Duplicate field "${key}" on the form.`);
    seen.add(key);
    const f = byKey.get(key);
    if (!f) throw new ValidationError(`Unknown or archived field "${key}".`);
    if (!isPublicFormFieldType(f.type)) {
      throw new ValidationError(`Field "${f.label}" (${f.type}) can't be used on a public form.`);
    }
  }
  for (const f of fields) {
    if (f.required && f.key !== TITLE_FIELD_KEY && !fieldKeys.includes(f.key)) {
      throw new ValidationError(
        `Required field "${f.label}" must be included on the form, or made optional.`,
      );
    }
  }
}

// ── DataForm CRUD ────────────────────────────────────────────
export type CreateDataFormInput = {
  organizationId: string;
  dataModelId: string;
  name: string;
  mode: DataFormMode;
  fieldKeys: string[];
  closesAt?: Date | null;
  intro?: string | null;
  successMessage?: string | null;
  listEnabled?: boolean;
  listReadFieldKeys?: string[];
  listPublicRead?: boolean;
  createdBy: string;
};

export async function createDataForm(input: CreateDataFormInput): Promise<DataFormRow> {
  await assertFormFieldsValid(input.dataModelId, input.fieldKeys);
  await assertBoardConfigValid(input.dataModelId, {
    listReadFieldKeys: input.listReadFieldKeys ?? [],
    listPublicRead: input.listPublicRead ?? true,
    mode: input.mode,
  });
  const db = getDb();
  // Retry on the astronomically unlikely token collision.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await db.dataForm.create({
        data: {
          organizationId: input.organizationId,
          dataModelId: input.dataModelId,
          name: input.name,
          token: generatePublicToken(),
          mode: input.mode,
          fieldKeys: input.fieldKeys,
          closesAt: input.closesAt ?? null,
          intro: input.intro ?? null,
          successMessage: input.successMessage ?? null,
          listEnabled: input.listEnabled ?? false,
          listReadFieldKeys: input.listReadFieldKeys ?? [],
          listPublicRead: input.listPublicRead ?? true,
          createdBy: input.createdBy,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err, "token") && attempt < 4) continue;
      throw err;
    }
  }
  throw new Error("could not generate a unique form token");
}

export async function listDataForms(dataModelId: string): Promise<DataFormRow[]> {
  const db = getDb();
  return db.dataForm.findMany({
    where: { dataModelId, deletedAt: null },
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function findDataFormById(id: string): Promise<DataFormRow | null> {
  return getDb().dataForm.findFirst({ where: { id, deletedAt: null } });
}

export async function findLiveDataFormByToken(token: string): Promise<DataFormRow | null> {
  return getDb().dataForm.findFirst({ where: { token, deletedAt: null } });
}

export type UpdateDataFormPatch = {
  name?: string;
  mode?: DataFormMode;
  fieldKeys?: string[];
  active?: boolean;
  closesAt?: Date | null;
  intro?: string | null;
  successMessage?: string | null;
  listEnabled?: boolean;
  listReadFieldKeys?: string[];
  listPublicRead?: boolean;
};

export async function updateDataForm(id: string, patch: UpdateDataFormPatch): Promise<DataFormRow> {
  const db = getDb();
  const form = await db.dataForm.findFirst({ where: { id, deletedAt: null } });
  if (!form) throw new NotFoundError("DataForm", id);
  if (patch.fieldKeys) await assertFormFieldsValid(form.dataModelId, patch.fieldKeys);
  // Re-validate the board config against the resulting mode + read fields.
  if (
    patch.listReadFieldKeys !== undefined ||
    patch.listPublicRead !== undefined ||
    patch.mode !== undefined
  ) {
    await assertBoardConfigValid(form.dataModelId, {
      listReadFieldKeys: patch.listReadFieldKeys ?? form.listReadFieldKeys,
      listPublicRead: patch.listPublicRead ?? form.listPublicRead,
      mode: patch.mode ?? form.mode,
    });
  }
  return db.dataForm.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.mode !== undefined ? { mode: patch.mode } : {}),
      ...(patch.fieldKeys !== undefined ? { fieldKeys: patch.fieldKeys } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      ...(patch.closesAt !== undefined ? { closesAt: patch.closesAt } : {}),
      ...(patch.intro !== undefined ? { intro: patch.intro } : {}),
      ...(patch.successMessage !== undefined ? { successMessage: patch.successMessage } : {}),
      ...(patch.listEnabled !== undefined ? { listEnabled: patch.listEnabled } : {}),
      ...(patch.listReadFieldKeys !== undefined
        ? { listReadFieldKeys: patch.listReadFieldKeys }
        : {}),
      ...(patch.listPublicRead !== undefined ? { listPublicRead: patch.listPublicRead } : {}),
    },
  });
}

// The public board's READ field selection : every key must be an active field
// of a public-safe type. Invite-gated read (`listPublicRead: false`) only makes
// sense for EMAIL-mode forms (there are no keys to gate an ANONYMOUS board).
export async function assertBoardConfigValid(
  dataModelId: string,
  cfg: { listReadFieldKeys: string[]; listPublicRead: boolean; mode: DataFormMode },
): Promise<void> {
  if (!cfg.listPublicRead && cfg.mode !== "EMAIL") {
    throw new ValidationError("Invite-only reading requires an email-invite form.");
  }
  if (cfg.listReadFieldKeys.length === 0) return;
  const fields = await listDataFields(dataModelId);
  const byKey = new Map(fields.map((f) => [f.key, f]));
  for (const key of cfg.listReadFieldKeys) {
    const f = byKey.get(key);
    if (!f) throw new ValidationError(`Unknown or archived field "${key}".`);
    if (!isPublicFormFieldType(f.type)) {
      throw new ValidationError(`Field "${f.label}" (${f.type}) can't be shown on a public board.`);
    }
  }
}

export async function softDeleteDataForm(id: string): Promise<void> {
  await getDb().dataForm.update({ where: { id }, data: { deletedAt: new Date() } });
}

// ── Invites (EMAIL mode) ─────────────────────────────────────
export async function listFormInvites(dataFormId: string): Promise<DataFormInviteRow[]> {
  return getDb().dataFormInvite.findMany({
    where: { dataFormId },
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function addFormInvite(input: {
  dataFormId: string;
  email: string;
  displayName?: string | null;
}): Promise<{ plaintext: string; invite: DataFormInviteRow }> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new ValidationError("invalid_email");
  const { plaintext, hash } = generateInviteToken();
  try {
    const invite = await getDb().dataFormInvite.create({
      data: {
        dataFormId: input.dataFormId,
        email,
        displayName: input.displayName?.trim() || null,
        tokenHash: hash,
      },
    });
    return { plaintext, invite };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ValidationError(`${email} has already been invited to this form.`);
    }
    throw err;
  }
}

export async function findFormInviteByToken(
  dataFormId: string,
  plaintext: string,
): Promise<DataFormInviteRow | null> {
  return getDb().dataFormInvite.findFirst({
    where: { dataFormId, tokenHash: hashToken(plaintext) },
  });
}

export async function findFormInviteById(id: string): Promise<DataFormInviteRow | null> {
  return getDb().dataFormInvite.findUnique({ where: { id } });
}

export async function removeFormInvite(id: string): Promise<void> {
  await getDb().dataFormInvite.delete({ where: { id } });
}

export async function markFormInviteSubmitted(id: string, recordId: string): Promise<void> {
  await getDb().dataFormInvite.update({
    where: { id },
    data: { submittedAt: new Date(), recordId },
  });
}

// ── Public submission ────────────────────────────────────────
// Validates the submitted data against ONLY the form's exposed fields (which
// strips any private key a submitter tries to inject), injects an auto title
// when `title` isn't exposed, then writes through the normal record path
// (which re-validates the whole record, computes formulas, derives the title).
// The author is a form sentinel, since the submitter has no user account.
export async function createPublicFormRecord(input: {
  form: DataFormRow;
  data: Record<string, unknown>;
  submitterEmail: string | null;
}): Promise<DataRecordRow> {
  const { form } = input;
  const fields = await listDataFields(form.dataModelId);
  const publicFields = fields.filter((f) => form.fieldKeys.includes(f.key));
  // Validating against ONLY the exposed fields strips any private key a
  // submitter tries to sneak in, and enforces the exposed required fields.
  const publicValues = recordDataSchema(publicFields).parse(input.data);

  const data: Record<string, unknown> = { ...publicValues };
  // The full-record validation in `createDataRecord` expects every active
  // (non-computed) field key present — the authed client always sends them
  // via defaults. A public submission only carries the exposed subset, so
  // fill an empty default for every non-exposed field (all of which are
  // optional by the form-save rule, except `title`, injected here).
  for (const f of fields) {
    if (f.key in data) continue;
    if ((f.type as string) === "FORMULA") continue;
    if (f.key === TITLE_FIELD_KEY) {
      data[TITLE_FIELD_KEY] = autoTitle(input.submitterEmail);
      continue;
    }
    data[f.key] = emptyValueForField(f);
  }

  const record = await createDataRecord({
    dataModelId: form.dataModelId,
    data,
    createdBy: `public-form:${form.id}`,
  });
  // Ledger row : links the record to the form and holds its board moderation
  // state. Starts PENDING (invisible to the public board until an admin
  // approves it). Kept even when the form has no board (audit trail).
  await getDb().dataFormEntry.create({
    data: { dataFormId: form.id, recordId: record.id, submitterEmail: input.submitterEmail },
  });
  return record;
}

// ── Board moderation ─────────────────────────────────────────
export async function listPendingEntries(dataFormId: string): Promise<DataFormEntryRow[]> {
  return getDb().dataFormEntry.findMany({
    where: { dataFormId, status: "PENDING" },
    orderBy: [{ createdAt: "asc" }],
  });
}

export async function findFormEntryById(id: string): Promise<DataFormEntryRow | null> {
  return getDb().dataFormEntry.findUnique({ where: { id } });
}

export async function setEntryStatus(
  id: string,
  status: Extract<DataFormEntryStatus, "PUBLISHED" | "REJECTED">,
  moderatorId: string,
): Promise<DataFormEntryRow> {
  return getDb().dataFormEntry.update({
    where: { id },
    data: { status, moderatedAt: new Date(), moderatedBy: moderatorId },
  });
}

export async function isRecordPublishedForForm(
  dataFormId: string,
  recordId: string,
): Promise<boolean> {
  const hit = await getDb().dataFormEntry.findFirst({
    where: { dataFormId, recordId, status: "PUBLISHED" },
    select: { id: true },
  });
  return hit !== null;
}

// ── Public board reads (projected to the read allow-list) ────
export type PublicBoardRecord = {
  id: string;
  title: string;
  updatedAt: Date;
  data: Record<string, unknown>;
};

// Strip a record down to the board's public-readable fields. The raw
// `DataRecord.data` (private fields, submitter values) never leaves the server.
export function projectPublicRecord(
  row: DataRecordRow,
  readFieldKeys: string[],
): PublicBoardRecord {
  const full = (row.data as Record<string, unknown>) ?? {};
  const data: Record<string, unknown> = {};
  for (const key of readFieldKeys) if (key in full) data[key] = full[key];
  return { id: row.id, title: row.title, updatedAt: row.updatedAt, data };
}

export type BoardSort = "recent" | "top";

// The public, searchable board list : only PUBLISHED entries of this form,
// each row projected to the read allow-list.
// - "recent" reuses the shared record search + keyset pagination.
// - "top" ranks by vote count (a relation `_count` orderBy), which can't be
//   keyset-paginated, so it uses an opaque numeric-offset cursor. The published
//   set is small + curated, so the offset scan is cheap. The client treats
//   `nextCursor` as opaque either way, so the paging UI is identical.
export async function listPublicBoardRecords(
  form: DataFormRow,
  args: PaginationArgs & { search?: string; sort?: BoardSort },
): Promise<Paginated<PublicBoardRecord>> {
  const project = (r: DataRecordRow) => projectPublicRecord(r, form.listReadFieldKeys);
  if (args.sort !== "top") {
    const page = await listDataRecords({
      dataModelId: form.dataModelId,
      search: args.search,
      publishedForFormId: form.id,
      bypassRoleAccess: true, // visibility is gated by PUBLISHED + the form, not roles
      limit: args.limit,
      cursor: args.cursor,
    });
    return { ...page, items: page.items.map(project) };
  }

  const db = getDb();
  const limit = resolveLimit(args.limit);
  const offset = args.cursor ? Math.max(0, Number.parseInt(args.cursor, 10) || 0) : 0;
  const where: Prisma.DataRecordWhereInput = {
    dataModelId: form.dataModelId,
    deletedAt: null,
    formEntries: { some: { dataFormId: form.id, status: "PUBLISHED" } },
    ...(args.search ? { title: { contains: args.search, mode: "insensitive" } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.dataRecord.findMany({
      where,
      orderBy: [{ votes: { _count: "desc" } }, { id: "desc" }],
      take: limit + 1,
      skip: offset,
    }),
    db.dataRecord.count({ where }),
  ]);
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map(project);
  return { items, nextCursor: hasMore ? String(offset + limit) : null, total };
}

// The empty value each field type's OPTIONAL value schema accepts (see
// `valueSchemaFor`). Non-exposed fields are always optional (the form-save
// rule forbids a required field being off the form), so these all validate.
function emptyValueForField(f: DataFieldRow): unknown {
  switch (f.type as string) {
    case "TEXT":
    case "LONG_TEXT":
    case "RICH_TEXT":
    case "URL":
    case "EMAIL":
      return "";
    case "BOOLEAN":
      return false;
    case "MULTI_SELECT":
    case "ATTACHMENTS":
    case "DOCUMENT":
      return [];
    case "RELATION":
      return (f.config as { cardinality?: string }).cardinality === "MANY" ? [] : null;
    default:
      // NUMBER, DATE, DATETIME, SELECT, FILE → nullable.
      return null;
  }
}

function autoTitle(submitterEmail: string | null): string {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  if (submitterEmail) return `${submitterEmail} — ${stamp}`;
  return `Submission — ${stamp}`;
}

// Prisma unique-constraint (P2002) helper ; optionally scoped to a target field.
function isUniqueViolation(err: unknown, field?: string): boolean {
  const e = err as { code?: string; meta?: { target?: string[] | string } };
  if (e?.code !== "P2002") return false;
  if (!field) return true;
  const target = e.meta?.target;
  return Array.isArray(target) ? target.includes(field) : target === field;
}
