import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import { advanceConversation, confirmToolCall, rejectToolCall } from "../../src/server/agent";
import { appendMessage, createConversation, listMessages } from "../../src/server/data";
import { setLlmProvider } from "../../src/server/llm";
import { setChatToolExecutor } from "../../src/server/tools";
import { FakeProvider, fakeExecutor, READ_TOOL, WRITE_TOOL } from "./fakes";

// Exercises the agent loop end-to-end against a real DB with a scripted model +
// a fake tool executor: plain replies, read-only tools running through, and the
// confirm-each-write gate (mutations pause at PROPOSED, then confirm/reject
// resumes the loop). Assumes the triggering user message is already persisted,
// exactly as the router does.

const ORG = "chat-agent-org";
const USER = "chat-agent-user";
const CTX = { userId: USER, organizationId: ORG };

async function newConversationWithPrompt(prompt = "hello") {
  const conv = await createConversation({ organizationId: ORG, userId: USER });
  await appendMessage({
    organizationId: ORG,
    conversationId: conv.id,
    authorType: "USER",
    authorUserId: USER,
    content: prompt,
  });
  return conv.id;
}

beforeAll(async () => {
  await getDb().organization.upsert({
    where: { id: ORG },
    create: { id: ORG, slug: ORG, displayName: ORG },
    update: {},
  });
  await getDb().user.upsert({
    where: { id: USER },
    create: { id: USER, email: `${USER}@example.com` },
    update: {},
  });
});

afterEach(async () => {
  await truncate(getDb(), ["Conversation"]);
  setLlmProvider(null);
  setChatToolExecutor(null);
});

afterAll(async () => {
  await getDb().user.delete({ where: { id: USER } }).catch(() => {});
  await getDb().organization.delete({ where: { id: ORG } }).catch(() => {});
});

describe("agent loop", () => {
  it("persists a plain assistant reply and finishes", async () => {
    setLlmProvider(new FakeProvider([[{ kind: "text-delta", text: "Hi there" }, { kind: "done", stopReason: "end" }]]));
    setChatToolExecutor(fakeExecutor([], () => ({ ok: true, result: null })));
    const conversationId = await newConversationWithPrompt();

    const result = await advanceConversation(CTX, conversationId, { context: { route: "/data" } });

    expect(result.status).toBe("done");
    const msgs = (await listMessages(ORG, conversationId, {})).items;
    expect(msgs.at(-1)?.authorType).toBe("AI_AGENT");
    expect(msgs.at(-1)?.content).toBe("Hi there");
  });

  it("runs a read-only tool without confirmation, then continues to a reply", async () => {
    setLlmProvider(
      new FakeProvider([
        [{ kind: "tool-call", id: "c1", name: READ_TOOL.name, input: {} }, { kind: "done", stopReason: "tool_use" }],
        [{ kind: "text-delta", text: "You have 0 models" }, { kind: "done", stopReason: "end" }],
      ]),
    );
    const executor = fakeExecutor([READ_TOOL, WRITE_TOOL], () => ({ ok: true, result: { models: [] } }));
    setChatToolExecutor(executor);
    const conversationId = await newConversationWithPrompt();

    const result = await advanceConversation(CTX, conversationId);

    expect(result.status).toBe("done");
    // The read-only tool ran immediately (no confirmation).
    expect(executor.calls).toEqual([{ name: READ_TOOL.name, input: {} }]);
    const toolCalls = await getDb().messageToolCall.findMany({ where: { organizationId: ORG } });
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.status).toBe("SUCCEEDED");
    expect(toolCalls[0]?.result).toEqual({ models: [] });
    // And the model got to speak after the tool result.
    expect((await listMessages(ORG, conversationId, {})).items.at(-1)?.content).toBe("You have 0 models");
  });

  it("gates a mutating tool: pauses at PROPOSED, executes only on confirm", async () => {
    setLlmProvider(
      new FakeProvider([
        [
          { kind: "tool-call", id: "w1", name: WRITE_TOOL.name, input: { data: { title: "T" } } },
          { kind: "done", stopReason: "tool_use" },
        ],
        [{ kind: "text-delta", text: "Created it." }, { kind: "done", stopReason: "end" }],
      ]),
    );
    const executor = fakeExecutor([READ_TOOL, WRITE_TOOL], () => ({ ok: true, result: { id: "rec_1" } }));
    setChatToolExecutor(executor);
    const conversationId = await newConversationWithPrompt("create a task");

    const first = await advanceConversation(CTX, conversationId);
    expect(first.status).toBe("awaiting_confirmation");
    // Not executed yet — that's the gate.
    expect(executor.calls).toHaveLength(0);
    const proposed = await getDb().messageToolCall.findFirstOrThrow({ where: { organizationId: ORG } });
    expect(proposed.status).toBe("PROPOSED");
    expect(proposed.mutates).toBe(true);

    const resumed = await confirmToolCall(CTX, proposed.id);
    expect(resumed.status).toBe("done");
    expect(executor.calls).toEqual([{ name: WRITE_TOOL.name, input: { data: { title: "T" } } }]);
    const after = await getDb().messageToolCall.findUniqueOrThrow({ where: { id: proposed.id } });
    expect(after.status).toBe("SUCCEEDED");
    expect(after.result).toEqual({ id: "rec_1" });
    expect((await listMessages(ORG, conversationId, {})).items.at(-1)?.content).toBe("Created it.");
  });

  it("rejecting a proposed tool marks it REJECTED and never executes it", async () => {
    setLlmProvider(
      new FakeProvider([
        [{ kind: "tool-call", id: "w1", name: WRITE_TOOL.name, input: {} }, { kind: "done", stopReason: "tool_use" }],
        [{ kind: "text-delta", text: "Okay, I won't." }, { kind: "done", stopReason: "end" }],
      ]),
    );
    const executor = fakeExecutor([WRITE_TOOL], () => ({ ok: true, result: null }));
    setChatToolExecutor(executor);
    const conversationId = await newConversationWithPrompt("delete everything");

    await advanceConversation(CTX, conversationId);
    const proposed = await getDb().messageToolCall.findFirstOrThrow({ where: { organizationId: ORG } });

    const resumed = await rejectToolCall(CTX, proposed.id);
    expect(resumed.status).toBe("done");
    expect(executor.calls).toHaveLength(0);
    const after = await getDb().messageToolCall.findUniqueOrThrow({ where: { id: proposed.id } });
    expect(after.status).toBe("REJECTED");
  });

  it("records a failed tool result the model can react to", async () => {
    setLlmProvider(
      new FakeProvider([
        [{ kind: "tool-call", id: "c1", name: READ_TOOL.name, input: {} }, { kind: "done", stopReason: "tool_use" }],
        [{ kind: "text-delta", text: "That failed." }, { kind: "done", stopReason: "end" }],
      ]),
    );
    setChatToolExecutor(
      fakeExecutor([READ_TOOL], () => ({ ok: false, error: "permission denied" })),
    );
    const conversationId = await newConversationWithPrompt();

    const result = await advanceConversation(CTX, conversationId);
    expect(result.status).toBe("done");
    const tc = await getDb().messageToolCall.findFirstOrThrow({ where: { organizationId: ORG } });
    expect(tc.status).toBe("FAILED");
    expect(tc.errorMessage).toBe("permission denied");
  });
});
