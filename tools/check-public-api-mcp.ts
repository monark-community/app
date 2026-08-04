import { V1_ROUTES } from "../services/api/src/public/routes";

// Enforces an explicit MCP-visibility decision on every public-API route.
//
// `RouteDescriptor.mcp` is a REQUIRED field, so a route can't even compile
// without deciding to `expose` it as an agent tool or `skip` it — this gate adds
// the runtime quality checks the type system can't : tool-name format + global
// uniqueness, non-trivial descriptions, and non-empty skip reasons. Because the
// MCP server auto-generates its tools from the OpenAPI (which carries these
// `expose` decisions as `x-mcp-tool`), a bad decision here would silently ship a
// broken or duplicate agent tool ; this fails CI first.

const TOOL_NAME_RE = /^monark_[a-z0-9_]+$/;
const MIN_DESCRIPTION = 20;

function main(): void {
  const errors: string[] = [];
  const toolNames = new Map<string, string>();
  let exposed = 0;
  let skipped = 0;

  for (const route of V1_ROUTES) {
    const where = `${route.method.toUpperCase()} ${route.path}`;
    const mcp = route.mcp;

    if ("expose" in mcp) {
      exposed++;
      const { name, description } = mcp.expose;
      if (!TOOL_NAME_RE.test(name)) {
        errors.push(`${where}: tool name "${name}" must match ${TOOL_NAME_RE}.`);
      }
      if (description.trim().length < MIN_DESCRIPTION) {
        errors.push(
          `${where}: tool "${name}" description is too short (< ${MIN_DESCRIPTION} chars) — write it for an agent.`,
        );
      }
      const seenAt = toolNames.get(name);
      if (seenAt) errors.push(`${where}: duplicate tool name "${name}" (also on ${seenAt}).`);
      else toolNames.set(name, where);
    } else if ("skip" in mcp) {
      skipped++;
      if (!mcp.skip.trim()) errors.push(`${where}: skip decision needs a non-empty reason.`);
    } else {
      errors.push(`${where}: mcp must be { expose } or { skip }.`);
    }
  }

  if (errors.length > 0) {
    console.error("check:mcp: FAIL");
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(
    `check:mcp: ok (${V1_ROUTES.length} routes : ${exposed} exposed as MCP tools, ${skipped} skipped)`,
  );
}

main();
