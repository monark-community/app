---
type: how-to
---

# Give the assistant a new tool

Let the AI assistant read or change something it can't reach today. If the action belongs on the public API, give its route in `services/api/src/public/routes.ts` an `mcp: { expose: { name, description } }` decision and skip to step 7: the assistant picks it up, and any method but `get` counts as a write. Otherwise, add an in-app-only tool.

1. In `services/api/src/chat/`, add the tool to its area's `<area>-tools.ts`, or create one that exports an `InAppTool[]`.
2. Give it a snake_case `name` prefixed with the area (`wiki_move_page`), unique across every tool, and a `description` written for the model: what it returns, when to use it, and which tool to call first.
3. Write a zod `inputSchema` with bounded strings (`.min()`, `.max()`). The model sees it as the tool's schema, and it validates the model's input before the tool runs.
4. Set `mutates: true` if the tool creates, changes, deletes or runs anything. That puts it behind the user's confirmation. When unsure, choose `true`.
5. Write `run(caller, input)` to call the area's tRPC procedure through `caller`. Don't check permissions or query the database in the tool; the procedure already enforces permissions and emits events.
6. If you created a file, add its array to `inAppTools` in `buildChatToolset()` (`services/api/src/chat/tools.ts`).
7. Add the name to `LABELLED_TOOLS` in `services/web/src/components/chat/tool-call-card.tsx`, and a `chat.toolActions.<name>` phrase ("move a wiki page") to every catalog in `services/web/src/messages/`. Without it, the confirm card shows a generated label.
8. Add a test with a fake caller, following `services/api/tests/automation-tools.test.ts`: assert the names, the `mutates` flags, and that bad input is rejected.
9. Run the checks:
   ```sh
   pnpm --filter api test
   pnpm check:i18n
   ```
10. Add the tool to [Assistant tools](../../reference/chat-agent-tools.md), with its permission.

Good to know: for a structure the model must get right, such as an automation graph, prefer one whole-object write validated before saving, so the model gets a list of problems to fix.

Next: [How the AI assistant works](../../concepts/chat-agent.md)
