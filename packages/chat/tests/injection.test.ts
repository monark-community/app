import { afterEach, describe, expect, it } from "vitest";
import { getChatToolExecutor, setChatToolExecutor, type ChatToolExecutor } from "../src/server/tools";
import { getLlmProvider, setLlmProvider, type LlmProvider } from "../src/server/llm";

// Unit coverage for the two injection seams (no DB / no network). The concrete
// executor is wired by services/api at boot; the provider defaults to Anthropic
// but is overridable for tests / alt hosts.

const noopExecutor: ChatToolExecutor = {
  listSpecs: () => [],
  getSpec: () => null,
  execute: async () => ({ ok: true, result: null }),
};

const fakeProvider: LlmProvider = {
  id: "fake",
  model: "fake",
  // eslint-disable-next-line require-yield
  streamChat: async function* () {
    return;
  },
};

afterEach(() => {
  setChatToolExecutor(null);
  setLlmProvider(null);
});

describe("chat tool executor injection", () => {
  it("throws a clear error when no executor is wired", () => {
    setChatToolExecutor(null);
    expect(() => getChatToolExecutor()).toThrow(/not configured|not wired/i);
  });

  it("returns the wired executor", () => {
    setChatToolExecutor(noopExecutor);
    expect(getChatToolExecutor()).toBe(noopExecutor);
  });
});

describe("llm provider selection", () => {
  it("returns an injected provider override without touching env", () => {
    setLlmProvider(fakeProvider);
    expect(getLlmProvider()).toBe(fakeProvider);
    expect(getLlmProvider().id).toBe("fake");
  });
});
