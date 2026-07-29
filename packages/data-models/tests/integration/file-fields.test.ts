import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import {
  createDataField,
  createDataModel,
  createDataRecord,
  updateDataRecord,
} from "../../src/server/data";

// Exercises `validateFileReferences` (the server-side gate for FILE /
// ATTACHMENTS fields) : a referenced id must be a READY StoredFile in the
// record's org, of an allowed MIME type, within the size cap, and (attachments)
// within the count cap. It only reads the StoredFile table (via
// `getReadyFilesByIds`), so we seed rows directly — no file storage needed.

const ORG = "dm-file-org";
const ORG2 = "dm-file-org2";
const USER = "dm-file-user";

let modelId = "";

const F = {
  png: "sf-ready-png",
  pdf1: "sf-ready-pdf1",
  pdf2: "sf-ready-pdf2",
  pdf3: "sf-ready-pdf3",
  pending: "sf-pending-png",
  big: "sf-big-png",
  crossOrg: "sf-crossorg-png",
};

async function seedFile(
  id: string,
  opts: { org?: string; contentType: string; size: number; status?: "READY" | "PENDING" },
): Promise<void> {
  const org = opts.org ?? ORG;
  await getDb().storedFile.create({
    data: {
      id,
      organizationId: org,
      bucket: "data-model-files",
      key: `${org}/${id}-file`,
      name: `${id}.bin`,
      contentType: opts.contentType,
      size: opts.size,
      status: opts.status ?? "READY",
      uploadedBy: USER,
    },
  });
}

/** Create a record, defaulting the two file fields to empty so each test only
 *  sets the field under test. */
function makeRecord(data: Record<string, unknown>) {
  return createDataRecord({
    dataModelId: modelId,
    data: { title: "t", avatar: null, docs: [], ...data },
    createdBy: USER,
  });
}

beforeAll(async () => {
  const db = getDb();
  await db.storedFile.deleteMany({ where: { id: { in: Object.values(F) } } });
  await db.organization.deleteMany({ where: { id: { in: [ORG, ORG2] } } });
  await db.user.deleteMany({ where: { id: USER } });

  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  await db.organization.create({ data: { id: ORG2, slug: ORG2, displayName: ORG2 } });
  await db.user.create({ data: { id: USER, email: `${USER}@test.local` } });

  const model = await createDataModel({
    organizationId: ORG,
    key: "assets",
    name: "Assets",
    createdBy: USER,
  });
  modelId = model.id;

  // avatar : a single image (wildcard MIME), ≤ 1 KB.
  await createDataField({
    dataModelId: modelId,
    key: "avatar",
    label: "Avatar",
    type: "FILE",
    config: { allowedFormats: ["image/*"], maxSizeBytes: 1000 },
  });
  // docs : up to 2 PDFs (exact MIME), ≤ 5 KB each.
  await createDataField({
    dataModelId: modelId,
    key: "docs",
    label: "Docs",
    type: "ATTACHMENTS",
    config: { allowedFormats: ["application/pdf"], maxSizeBytes: 5000, max: 2 },
  });

  await seedFile(F.png, { contentType: "image/png", size: 500 });
  await seedFile(F.pdf1, { contentType: "application/pdf", size: 500 });
  await seedFile(F.pdf2, { contentType: "application/pdf", size: 500 });
  await seedFile(F.pdf3, { contentType: "application/pdf", size: 500 });
  await seedFile(F.pending, { contentType: "image/png", size: 500, status: "PENDING" });
  await seedFile(F.big, { contentType: "image/png", size: 2000 });
  await seedFile(F.crossOrg, { contentType: "image/png", size: 500, org: ORG2 });
});

afterAll(async () => {
  const db = getDb();
  await db.storedFile.deleteMany({ where: { id: { in: Object.values(F) } } });
  await db.organization.deleteMany({ where: { id: { in: [ORG, ORG2] } } });
  await db.user.deleteMany({ where: { id: USER } });
});

describe("FILE / ATTACHMENTS reference validation", () => {
  it("accepts a valid FILE reference (wildcard MIME match)", async () => {
    const rec = await makeRecord({ avatar: F.png });
    expect((rec.data as Record<string, unknown>).avatar).toBe(F.png);
  });

  it("accepts ATTACHMENTS up to the max count", async () => {
    const rec = await makeRecord({ docs: [F.pdf1, F.pdf2] });
    expect((rec.data as Record<string, unknown>).docs).toEqual([F.pdf1, F.pdf2]);
  });

  it("rejects a non-existent file id", async () => {
    await expect(makeRecord({ avatar: "does-not-exist" })).rejects.toThrow();
  });

  it("rejects a PENDING (not-yet-ready) file", async () => {
    await expect(makeRecord({ avatar: F.pending })).rejects.toThrow();
  });

  it("rejects a file from another org", async () => {
    await expect(makeRecord({ avatar: F.crossOrg })).rejects.toThrow();
  });

  it("rejects a disallowed MIME type (pdf into an image-only FILE)", async () => {
    await expect(makeRecord({ avatar: F.pdf1 })).rejects.toThrow();
  });

  it("rejects a file over the size cap", async () => {
    await expect(makeRecord({ avatar: F.big })).rejects.toThrow();
  });

  it("rejects ATTACHMENTS over the max count", async () => {
    await expect(makeRecord({ docs: [F.pdf1, F.pdf2, F.pdf3] })).rejects.toThrow();
  });

  it("rejects a disallowed MIME type inside ATTACHMENTS (png into a pdf-only field)", async () => {
    await expect(makeRecord({ docs: [F.png] })).rejects.toThrow();
  });

  it("validates references on update, not just create", async () => {
    const rec = await makeRecord({ avatar: F.png });
    await expect(updateDataRecord(rec.id, { data: { avatar: F.big } })).rejects.toThrow();
  });
});
