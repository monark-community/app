import { describe, expect, it } from "vitest";
import { buildChatToolset } from "../src/chat/tools";

// buildChatToolset assembles the agent's toolset from the public V1_ROUTES
// (route-derived tools) plus the in-app automation tools. Constructing it
// exercises the input-schema builder over every exposed route; the execute
// error paths run without a database (validation fails before any caller is
// built), so this is a pure unit suite.
describe("buildChatToolset", () => {
  const toolset = buildChatToolset();

  it("lists route-derived tools plus the in-app automation tools, all well-formed", () => {
    const specs = toolset.listSpecs();
    const names = new Set(specs.map((s) => s.name));
    expect(names.has("automation_list")).toBe(true);
    expect(names.has("automation_create")).toBe(true);
    // There is at least one route-derived (non-automation) tool.
    expect(specs.some((s) => !s.name.startsWith("automation_"))).toBe(true);

    for (const s of specs) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
      expect(s.inputSchema).toBeTruthy();
      expect(typeof s.mutates).toBe("boolean");
    }
    // Confirm-gate classification carries through from the in-app tools.
    expect(specs.find((s) => s.name === "automation_list")?.mutates).toBe(false);
    expect(specs.find((s) => s.name === "automation_create")?.mutates).toBe(true);
  });

  it("builds a flat object JSON schema for a route-derived tool", () => {
    const routeSpec = toolset.listSpecs().find((s) => !s.name.startsWith("automation_"));
    expect(routeSpec).toBeTruthy();
    expect((routeSpec?.inputSchema as { type?: string }).type).toBe("object");
  });

  it("getSpec returns a known spec and null for an unknown name", () => {
    expect(toolset.getSpec("automation_list")?.name).toBe("automation_list");
    expect(toolset.getSpec("does_not_exist")).toBeNull();
  });

  it("execute reports an unknown tool as a failed result without throwing", async () => {
    const res = await toolset.execute({
      ctx: { userId: "u1", organizationId: "o1" },
      toolName: "does_not_exist",
      input: {},
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Unknown tool");
  });

  it("execute surfaces an in-app tool's input-validation error as a failed result", async () => {
    // automation_get requires { id }; empty input fails its zod schema before
    // any caller is constructed, so no database is touched.
    const res = await toolset.execute({
      ctx: { userId: "u1", organizationId: "o1" },
      toolName: "automation_get",
      input: {},
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Invalid arguments");
  });
});
