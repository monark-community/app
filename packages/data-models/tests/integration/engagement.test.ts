import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import { createDataModel, createDataRecord } from "../../src/server/data";
import { createDataForm, listPublicBoardRecords } from "../../src/server/forms";
import {
  commentCountFor,
  createRecordComment,
  listRecordComments,
  setCommentHidden,
  softDeleteComment,
  toggleVote,
  voteStateFor,
} from "../../src/server/engagement";

// Integration tests for the engagement data layer (votes + comments) against a
// real Postgres testcontainer.

const ORG = "dm-engage-org";
const ACTOR = "dm-engage-actor";
const ACTOR2 = "dm-engage-actor2";

beforeAll(async () => {
  const db = getDb();
  await db.organization.upsert({
    where: { id: ORG },
    create: { id: ORG, slug: ORG, displayName: ORG },
    update: {},
  });
  for (const id of [ACTOR, ACTOR2]) {
    await db.user.upsert({
      where: { id },
      create: { id, email: `${id}@test.local` },
      update: {},
    });
  }
});

afterEach(async () => {
  await truncate(getDb(), [
    "DataRecordComment",
    "DataRecordVote",
    "DataFormEntry",
    "DataForm",
    "DataRecord",
    "DataField",
    "DataModel",
  ]);
});

afterAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: [ACTOR, ACTOR2] } } });
});

// A model with only the reserved auto-created `title` field, so a record's
// data is just `{ title }`.
async function seedModel(key = "reqs") {
  return createDataModel({ organizationId: ORG, key, name: "Requests", createdBy: ACTOR });
}

async function seedRecord(dataModelId: string, title: string) {
  return createDataRecord({ dataModelId, data: { title }, createdBy: ACTOR });
}

describe("toggleVote", () => {
  it("adds then removes the same identity's vote, tracking the count", async () => {
    const model = await seedModel();
    const rec = await seedRecord(model.id, "Feature A");

    const first = await toggleVote(rec.id, `user:${ACTOR}`, ACTOR);
    expect(first).toEqual({ voted: true, count: 1 });

    const second = await toggleVote(rec.id, `user:${ACTOR}`, ACTOR);
    expect(second).toEqual({ voted: false, count: 0 });
  });

  it("counts a user and an invite as distinct identities", async () => {
    const model = await seedModel();
    const rec = await seedRecord(model.id, "Feature A");

    await toggleVote(rec.id, `user:${ACTOR}`, ACTOR);
    const invite = await toggleVote(rec.id, "invite:abc123");
    expect(invite.count).toBe(2);
  });
});

describe("voteStateFor", () => {
  it("returns batched counts and the caller's own hasVoted", async () => {
    const model = await seedModel();
    const a = await seedRecord(model.id, "A");
    const b = await seedRecord(model.id, "B");

    await toggleVote(a.id, `user:${ACTOR}`, ACTOR);
    await toggleVote(a.id, `user:${ACTOR2}`, ACTOR2);
    await toggleVote(b.id, `user:${ACTOR2}`, ACTOR2);

    const state = await voteStateFor([a.id, b.id], `user:${ACTOR}`);
    expect(state[a.id]).toEqual({ count: 2, hasVoted: true });
    expect(state[b.id]).toEqual({ count: 1, hasVoted: false });
  });

  it("hasVoted is false everywhere for an anonymous viewer", async () => {
    const model = await seedModel();
    const a = await seedRecord(model.id, "A");
    await toggleVote(a.id, `user:${ACTOR}`, ACTOR);
    const state = await voteStateFor([a.id]);
    expect(state[a.id]).toEqual({ count: 1, hasVoted: false });
  });
});

describe("comments", () => {
  it("tag-strips the body and rejects an empty result", async () => {
    const model = await seedModel();
    const rec = await seedRecord(model.id, "A");

    const c = await createRecordComment(rec.id, ACTOR, "  <b>hi</b>   there  ");
    expect(c.body).toBe("hi there");

    await expect(createRecordComment(rec.id, ACTOR, "  <br>  ")).rejects.toThrow();
  });

  it("hides moderated + soft-deleted comments from the public list", async () => {
    const model = await seedModel();
    const rec = await seedRecord(model.id, "A");

    const visible = await createRecordComment(rec.id, ACTOR, "visible");
    const hidden = await createRecordComment(rec.id, ACTOR, "hidden");
    const gone = await createRecordComment(rec.id, ACTOR, "gone");
    await setCommentHidden(hidden.id, true);
    await softDeleteComment(gone.id);

    const pub = await listRecordComments(rec.id, {});
    expect(pub.items.map((c) => c.id)).toEqual([visible.id]);

    // A moderator view includes the hidden one (flagged), never the deleted one.
    const mod = await listRecordComments(rec.id, { includeHidden: true });
    expect(mod.items.map((c) => c.id).sort()).toEqual([hidden.id, visible.id].sort());
    expect(mod.items.find((c) => c.id === hidden.id)?.hidden).toBe(true);

    expect((await commentCountFor([rec.id]))[rec.id]).toBe(1);
  });
});

describe("listPublicBoardRecords sort", () => {
  it("ranks by vote count under sort=top", async () => {
    const model = await seedModel();
    const low = await seedRecord(model.id, "Low");
    const high = await seedRecord(model.id, "High");

    const form = await createDataForm({
      organizationId: ORG,
      dataModelId: model.id,
      name: "Board",
      mode: "ANONYMOUS",
      fieldKeys: [],
      listEnabled: true,
      listReadFieldKeys: [],
      listPublicRead: true,
      createdBy: ACTOR,
    });
    // Publish both records onto the board.
    for (const rec of [low, high]) {
      await getDb().dataFormEntry.create({
        data: { dataFormId: form.id, recordId: rec.id, status: "PUBLISHED" },
      });
    }
    // `high` gets two votes, `low` gets none.
    await toggleVote(high.id, `user:${ACTOR}`, ACTOR);
    await toggleVote(high.id, `user:${ACTOR2}`, ACTOR2);

    const page = await listPublicBoardRecords(form, { sort: "top" });
    expect(page.items.map((r) => r.id)).toEqual([high.id, low.id]);
  });
});
