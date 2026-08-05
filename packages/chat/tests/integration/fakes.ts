import type { LlmProvider, LlmStreamEvent } from "../../src/server/llm";
import type { AgentToolSpec, ChatToolExecutor, ToolExecuteResult } from "../../src/server/tools";

// A scripted LlmProvider: each element of `scripts` is the ordered event stream
// for one streamChat() call (one agent turn). Lets a test drive the loop turn by
// turn without a real model or network.
export class FakeProvider implements LlmProvider {
  readonly id = "fake";
  readonly model = "fake";
  private calls = 0;
  constructor(private readonly scripts: LlmStreamEvent[][]) {}
  async *streamChat(): AsyncIterable<LlmStreamEvent> {
    const script = this.scripts[this.calls++] ?? [{ kind: "done", stopReason: "end" }];
    for (const ev of script) yield ev;
  }
}

// A ChatToolExecutor whose execution is a plain function, so a test controls
// each tool's result (and records that it was called).
export function fakeExecutor(
  specs: AgentToolSpec[],
  impl: (name: string, input: unknown) => ToolExecuteResult,
): ChatToolExecutor & { calls: Array<{ name: string; input: unknown }> } {
  const calls: Array<{ name: string; input: unknown }> = [];
  return {
    calls,
    listSpecs: () => specs,
    getSpec: (n) => specs.find((s) => s.name === n) ?? null,
    execute: async ({ toolName, input }) => {
      calls.push({ name: toolName, input });
      return impl(toolName, input);
    },
  };
}

export const READ_TOOL: AgentToolSpec = {
  name: "monark_list_models",
  description: "List models",
  inputSchema: { type: "object" },
  mutates: false,
};

export const WRITE_TOOL: AgentToolSpec = {
  name: "monark_create_record",
  description: "Create a record",
  inputSchema: { type: "object" },
  mutates: true,
};
