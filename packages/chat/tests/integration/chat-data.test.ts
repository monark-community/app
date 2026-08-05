import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import {
  appendMessage,
  createConversation,
  ensureConversationTitle,
  getConversationForUser,
  getToolCall,
  listConversations,
  listMessages,
  recordToolCall,
  updateToolCallStatus,
} from "../../src/server/data";

// Exercises the chat data layer against a real Postgres testcontainer: per-org
// + per-participant scoping, message ordering, the conversation<->message link,
// and the tool-call lifecycle.

const ORG_A = "chat-org-a";
const ORG_B = "chat-org-b";
const USER_A = "chat-user-a";
const USER_B = "chat-user-b";

beforeAll(async () => {
  const db = getDb();
  for (const id of [ORG_A, ORG_B]) {
    await db.organization.upsert({ where: { id }, create: { id, slug: id, displayName: id }, update: {} });
  }
  for (const id of [USER_A, USER_B]) {
    await db.user.upsert({ where: { id }, create: { id, email: `${id}@example.com` }, update: {} });
  }
});

afterEach(async () => {
  // MessageToolCall / Message / ConversationParticipant cascade from Conversation.
  await truncate(getDb(), ["Conversation"]);
});

afterAll(async () => {
  const db = getDb();
  for (const id of [USER_A, USER_B]) await db.user.delete({ where: { id } }).catch(() => {});
  for (const id of [ORG_A, ORG_B]) await db.organization.delete({ where: { id } }).catch(() => {});
});

describe("chat data layer", () => {
  it("creates an AI conversation with the creator + AI participants", async () => {
    const conv = await createConversation({ organizationId: ORG_A, userId: USER_A });
    expect(conv.kind).toBe("AI_ASSISTANT");
    const participants = await getDb().conversationParticipant.findMany({
      where: { conversationId: conv.id },
    });
    expect(participants).toHaveLength(2);
    expect(participants.some((p) => p.participantType === "USER" && p.userId === USER_A)).toBe(true);
    expect(participants.some((p) => p.participantType === "AI_AGENT" && p.userId === null)).toBe(true);
  });

  it("lists only conversations the user participates in, within the org", async () => {
    const a = await createConversation({ organizationId: ORG_A, userId: USER_A });
    await createConversation({ organizationId: ORG_A, userId: USER_B }); // other user
    await createConversation({ organizationId: ORG_B, userId: USER_A }); // other org

    const forA = await listConversations(ORG_A, USER_A, {});
    expect(forA.items.map((c) => c.id)).toEqual([a.id]);
    expect(forA.total).toBe(1);
  });

  it("gates conversation access: another org/user cannot resolve it", async () => {
    const conv = await createConversation({ organizationId: ORG_A, userId: USER_A });
    expect(await getConversationForUser(ORG_A, conv.id, USER_A)).not.toBeNull();
    // Wrong user (not a participant) → null.
    expect(await getConversationForUser(ORG_A, conv.id, USER_B)).toBeNull();
    // Wrong org → null.
    expect(await getConversationForUser(ORG_B, conv.id, USER_A)).toBeNull();
  });

  it("appends messages in order and bumps lastMessageAt", async () => {
    const conv = await createConversation({ organizationId: ORG_A, userId: USER_A });
    await appendMessage({
      organizationId: ORG_A,
      conversationId: conv.id,
      authorType: "USER",
      authorUserId: USER_A,
      content: "first",
    });
    await appendMessage({
      organizationId: ORG_A,
      conversationId: conv.id,
      authorType: "AI_AGENT",
      content: "second",
    });
    const page = await listMessages(ORG_A, conv.id, {});
    expect(page.items.map((m) => m.content)).toEqual(["first", "second"]);
    expect(page.items[0]?.authorType).toBe("USER");
    expect(page.items[1]?.authorType).toBe("AI_AGENT");

    const refreshed = await getConversationForUser(ORG_A, conv.id, USER_A);
    expect(refreshed?.lastMessageAt).toBeInstanceOf(Date);
  });

  it("auto-titles a conversation only while it has none", async () => {
    const conv = await createConversation({ organizationId: ORG_A, userId: USER_A });
    const applied = await ensureConversationTitle(ORG_A, conv.id, "Plan my week");
    expect(applied).toBe("Plan my week");
    // A second attempt is a no-op (title already set).
    expect(await ensureConversationTitle(ORG_A, conv.id, "Something else")).toBeNull();
    expect((await getConversationForUser(ORG_A, conv.id, USER_A))?.title).toBe("Plan my week");
  });

  it("records a tool call on a message and transitions its status + result", async () => {
    const conv = await createConversation({ organizationId: ORG_A, userId: USER_A });
    const msg = await appendMessage({
      organizationId: ORG_A,
      conversationId: conv.id,
      authorType: "AI_AGENT",
      content: "",
    });
    const tc = await recordToolCall({
      organizationId: ORG_A,
      messageId: msg.id,
      toolCallRef: "call_1",
      toolName: "monark_create_record",
      input: { data: { title: "x" } },
      mutates: true,
      status: "PROPOSED",
    });
    expect(tc.status).toBe("PROPOSED");

    await updateToolCallStatus({
      organizationId: ORG_A,
      id: tc.id,
      status: "SUCCEEDED",
      result: { id: "rec_1" },
    });
    const fetched = await getToolCall(ORG_A, tc.id);
    expect(fetched?.status).toBe("SUCCEEDED");
    expect(fetched?.result).toEqual({ id: "rec_1" });
    expect(fetched?.conversationId).toBe(conv.id);
    // The input (the model's arguments) is persisted for audit/replay.
    expect(fetched?.input).toEqual({ data: { title: "x" } });
  });

  it("soft-deletes a conversation so it drops out of the list", async () => {
    const conv = await createConversation({ organizationId: ORG_A, userId: USER_A });
    await getDb().conversation.update({ where: { id: conv.id }, data: { deletedAt: new Date() } });
    const forA = await listConversations(ORG_A, USER_A, {});
    expect(forA.items).toHaveLength(0);
    expect(await getConversationForUser(ORG_A, conv.id, USER_A)).toBeNull();
  });
});
