import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import { createDataField, createDataModel, updateDataRecord } from "../../src/server/data";
import {
  addFormInvite,
  assertBoardConfigValid,
  assertFormFieldsValid,
  createDataForm,
  createPublicFormRecord,
  findFormInviteByToken,
  findLiveDataFormByToken,
  isRecordPublishedForForm,
  listPendingEntries,
  listPublicBoardRecords,
  markFormInviteSubmitted,
  setEntryStatus,
} from "../../src/server/forms";

// Integration tests for the public-forms data layer against a real Postgres
// testcontainer : field-selection validation, the privacy guarantee (private
// keys are stripped from a submission), auto-title, and single-use invites.

const ORG = "dm-forms-org";
const ACTOR = "dm-forms-actor";

beforeAll(async () => {
  const db = getDb();
  await db.organization.upsert({
    where: { id: ORG },
    create: { id: ORG, slug: ORG, displayName: ORG },
    update: {},
  });
  await db.user.upsert({
    where: { id: ACTOR },
    create: { id: ACTOR, email: `${ACTOR}@test.local` },
    update: {},
  });
});

afterEach(async () => {
  await truncate(getDb(), [
    "DataFormEntry",
    "DataFormInvite",
    "DataForm",
    "DataFieldIndex",
    "DataModelIntegration",
    "DataRecord",
    "DataField",
    "DataModel",
  ]);
});

afterAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: ACTOR } });
});

// A model with: reserved `title` (required TEXT, auto-created), a public
// optional `note`, a private admin-only `status` (SELECT), and a required
// `count` number.
async function seedModel() {
  const model = await createDataModel({
    organizationId: ORG,
    key: "poll",
    name: "Poll",
    createdBy: ACTOR,
  });
  await createDataField({
    dataModelId: model.id,
    key: "note",
    label: "Note",
    type: "TEXT",
    config: {},
  });
  await createDataField({
    dataModelId: model.id,
    key: "status",
    label: "Status",
    type: "SELECT",
    config: {
      options: [
        { value: "new", label: "New" },
        { value: "done", label: "Done" },
      ],
    },
  });
  await createDataField({
    dataModelId: model.id,
    key: "count",
    label: "Count",
    type: "NUMBER",
    config: {},
    required: true,
  });
  return model;
}

describe("assertFormFieldsValid", () => {
  it("rejects a required field that isn't on the form", async () => {
    const model = await seedModel();
    // `count` is required but omitted → must throw.
    await expect(assertFormFieldsValid(model.id, ["title", "note"])).rejects.toThrow();
  });

  it("accepts when every required field (except title) is included", async () => {
    const model = await seedModel();
    await expect(assertFormFieldsValid(model.id, ["note", "count"])).resolves.toBeUndefined();
  });

  it("rejects a non-public field type", async () => {
    const model = await seedModel();
    await createDataField({
      dataModelId: model.id,
      key: "attachment",
      label: "Attachment",
      type: "FILE",
      config: {},
    });
    await expect(assertFormFieldsValid(model.id, ["count", "attachment"])).rejects.toThrow();
  });
});

describe("createPublicFormRecord", () => {
  it("strips private keys, injects a title, and stamps the form author", async () => {
    const model = await seedModel();
    const form = await createDataForm({
      organizationId: ORG,
      dataModelId: model.id,
      name: "Reader poll",
      mode: "ANONYMOUS",
      fieldKeys: ["note", "count"], // title NOT exposed → auto-generated
      createdBy: ACTOR,
    });

    const record = await createPublicFormRecord({
      form,
      // A malicious submitter tries to also set the private `status`.
      data: { note: "hello", count: 3, status: "done", bogus: "x" },
      submitterEmail: null,
    });

    const data = record.data as Record<string, unknown>;
    expect(data.note).toBe("hello");
    expect(data.count).toBe(3);
    // The private `status` field defaults to empty (null) — the submitter's
    // injected "done" was ignored, not written.
    expect(data.status).toBeNull();
    // A key that isn't a field at all never appears.
    expect(data.bogus).toBeUndefined();
    // Title was auto-generated (not empty).
    expect(record.title.length).toBeGreaterThan(0);
    expect(record.createdBy).toBe(`public-form:${form.id}`);
  });

  it("rejects a submission missing a required public field", async () => {
    const model = await seedModel();
    const form = await createDataForm({
      organizationId: ORG,
      dataModelId: model.id,
      name: "Reader poll",
      mode: "ANONYMOUS",
      fieldKeys: ["note", "count"],
      createdBy: ACTOR,
    });
    await expect(
      createPublicFormRecord({ form, data: { note: "no count here" }, submitterEmail: null }),
    ).rejects.toThrow();
  });
});

describe("email invites", () => {
  it("are single-use: the key resolves, then locks after submission", async () => {
    const model = await seedModel();
    const form = await createDataForm({
      organizationId: ORG,
      dataModelId: model.id,
      name: "Invited poll",
      mode: "EMAIL",
      fieldKeys: ["count"],
      createdBy: ACTOR,
    });
    const { plaintext, invite } = await addFormInvite({
      dataFormId: form.id,
      email: "Reader@Example.com",
    });
    expect(invite.email).toBe("reader@example.com"); // normalized

    const found = await findFormInviteByToken(form.id, plaintext);
    expect(found?.id).toBe(invite.id);
    expect(found?.submittedAt).toBeNull();

    const record = await createPublicFormRecord({
      form,
      data: { count: 1 },
      submitterEmail: invite.email,
    });
    await markFormInviteSubmitted(invite.id, record.id);

    const after = await findFormInviteByToken(form.id, plaintext);
    expect(after?.submittedAt).not.toBeNull();
    expect(after?.recordId).toBe(record.id);
  });

  it("rejects a duplicate email on the same form", async () => {
    const model = await seedModel();
    const form = await createDataForm({
      organizationId: ORG,
      dataModelId: model.id,
      name: "Invited poll",
      mode: "EMAIL",
      fieldKeys: ["count"],
      createdBy: ACTOR,
    });
    await addFormInvite({ dataFormId: form.id, email: "dup@example.com" });
    await expect(
      addFormInvite({ dataFormId: form.id, email: "dup@example.com" }),
    ).rejects.toThrow();
  });
});

describe("public boards (read side)", () => {
  it("rejects a non-public read field and invite-only read on an anonymous form", async () => {
    const model = await seedModel();
    await createDataField({
      dataModelId: model.id,
      key: "attachment",
      label: "Attachment",
      type: "FILE",
      config: {},
    });
    await expect(
      assertBoardConfigValid(model.id, {
        listReadFieldKeys: ["attachment"],
        listPublicRead: true,
        mode: "ANONYMOUS",
      }),
    ).rejects.toThrow();
    await expect(
      assertBoardConfigValid(model.id, {
        listReadFieldKeys: [],
        listPublicRead: false,
        mode: "ANONYMOUS",
      }),
    ).rejects.toThrow();
  });

  it("hides pending entries and only exposes the read fields once published", async () => {
    const model = await seedModel();
    const form = await createDataForm({
      organizationId: ORG,
      dataModelId: model.id,
      name: "Feature requests",
      mode: "ANONYMOUS",
      fieldKeys: ["note", "count"], // writable
      listEnabled: true,
      listReadFieldKeys: ["note", "status"], // readable (status is admin-only, not writable)
      listPublicRead: true,
      createdBy: ACTOR,
    });

    const record = await createPublicFormRecord({
      form,
      data: { note: "please add dark mode", count: 5 },
      submitterEmail: null,
    });

    // PENDING → invisible to the public board.
    expect(await isRecordPublishedForForm(form.id, record.id)).toBe(false);
    expect((await listPublicBoardRecords(form, {})).items).toHaveLength(0);

    // Admin approves it.
    const [pending] = await listPendingEntries(form.id);
    expect(pending?.recordId).toBe(record.id);
    await setEntryStatus(pending!.id, "PUBLISHED", ACTOR);

    // Now visible, projected to ONLY the read fields.
    expect(await isRecordPublishedForForm(form.id, record.id)).toBe(true);
    const page = await listPublicBoardRecords(form, {});
    expect(page.items).toHaveLength(1);
    const item = page.items[0]!;
    expect(item.title.length).toBeGreaterThan(0);
    expect(item.data.note).toBe("please add dark mode");
    expect("status" in item.data).toBe(true); // read-exposed (currently null)
    expect("count" in item.data).toBe(false); // writable but NOT read-exposed → hidden

    // An admin later sets the private `status`; it flows to the public board.
    await updateDataRecord(record.id, { data: { status: "done" } });
    const after = await listPublicBoardRecords(form, {});
    expect(after.items[0]!.data.status).toBe("done");
  });

  it("search filters the published set by title", async () => {
    const model = await seedModel();
    const form = await createDataForm({
      organizationId: ORG,
      dataModelId: model.id,
      name: "Q&A",
      mode: "ANONYMOUS",
      fieldKeys: ["title", "count"],
      listEnabled: true,
      listReadFieldKeys: [],
      listPublicRead: true,
      createdBy: ACTOR,
    });
    for (const title of ["Alpha question", "Beta question"]) {
      const r = await createPublicFormRecord({
        form,
        data: { title, count: 1 },
        submitterEmail: null,
      });
      const entry = (await listPendingEntries(form.id)).find((e) => e.recordId === r.id)!;
      await setEntryStatus(entry.id, "PUBLISHED", ACTOR);
    }
    const filtered = await listPublicBoardRecords(form, { search: "Alpha" });
    expect(filtered.items.map((i) => i.title)).toEqual(["Alpha question"]);
  });
});

describe("findLiveDataFormByToken", () => {
  it("resolves a live form by its public token", async () => {
    const model = await seedModel();
    const form = await createDataForm({
      organizationId: ORG,
      dataModelId: model.id,
      name: "Tokened",
      mode: "ANONYMOUS",
      fieldKeys: ["count"],
      createdBy: ACTOR,
    });
    const found = await findLiveDataFormByToken(form.token);
    expect(found?.id).toBe(form.id);
    expect(found?.organizationId).toBe(ORG);
  });
});
