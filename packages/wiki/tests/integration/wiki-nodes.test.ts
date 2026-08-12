import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The nodes gate on the automation owner's wiki permission via
// `hasPermission` ; mock it to "granted" so the tests exercise the node logic +
// data layer, not RBAC seeding. (RBAC itself is tested in @monark/rbac.)
vi.mock("@monark/rbac/server", () => ({ hasPermission: async () => true }));

import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import { blocksToText } from "@monark/common/blocks";
import { wikiCreatePageNode, wikiDeletePageNode, wikiUpdatePageNode } from "../../src/server/nodes";
import { findPageById, listPagesForOrg } from "../../src/server/data";
import type { NodeExecutionContext } from "@monark/automation/server";

const ORG = "wiki-nodes-org";
const USER = "wiki-nodes-user";

/** A minimal execution context ; the nodes only read org / owner / log. */
function ctx(overrides: Partial<NodeExecutionContext> = {}): NodeExecutionContext {
  return {
    organizationId: ORG,
    actorUserId: USER,
    triggerEvent: {
      type: "manual",
      occurredAt: new Date(),
    } as unknown as NodeExecutionContext["triggerEvent"],
    runId: "run-1",
    automationId: "auto-1",
    upstream: {},
    log: () => {},
    activateOutputs: () => {},
    suspend: () => {},
    getSecret: async () => null,
    ...overrides,
  };
}

beforeAll(async () => {
  await getDb().organization.upsert({
    where: { id: ORG },
    create: { id: ORG, slug: ORG, displayName: ORG },
    update: {},
  });
});
afterEach(async () => {
  await truncate(getDb(), ["WikiPage"]);
});
afterAll(async () => {
  await getDb()
    .organization.delete({ where: { id: ORG } })
    .catch(() => {});
});

describe("wiki automation nodes", () => {
  it("create-page makes a page, nests under a parent, and writes a text body", async () => {
    const root = (await wikiCreatePageNode.run(ctx(), { title: "Root" })) as { pageId: string };
    const child = (await wikiCreatePageNode.run(ctx(), {
      title: "Child",
      parentId: root.pageId,
      icon: "📄",
      body: "line one\nline two",
    })) as { pageId: string; title: string };

    expect(child.title).toBe("Child");
    const page = await findPageById(child.pageId);
    expect(page?.parentId).toBe(root.pageId);
    expect(page?.icon).toBe("📄");
    // The plain-text body round-trips through the block content.
    expect(blocksToText(page?.content)).toBe("line one\nline two");
  });

  it("create-page rejects a parent from another org and a missing owner", async () => {
    await expect(wikiCreatePageNode.run(ctx(), { title: "X", parentId: "nope" })).rejects.toThrow(
      /not found/i,
    );
    await expect(
      wikiCreatePageNode.run(ctx({ actorUserId: null }), { title: "X" }),
    ).rejects.toThrow(/owner/i);
  });

  it("update-page patches title / icon / body", async () => {
    const created = (await wikiCreatePageNode.run(ctx(), { title: "Old" })) as { pageId: string };
    await wikiUpdatePageNode.run(ctx(), {
      pageId: created.pageId,
      title: "New",
      body: "fresh body",
    });
    const page = await findPageById(created.pageId);
    expect(page?.title).toBe("New");
    expect(blocksToText(page?.content)).toBe("fresh body");
  });

  it("delete-page soft-deletes the page and its subtree", async () => {
    const root = (await wikiCreatePageNode.run(ctx(), { title: "Root" })) as { pageId: string };
    await wikiCreatePageNode.run(ctx(), { title: "Child", parentId: root.pageId });

    const result = (await wikiDeletePageNode.run(ctx(), { pageId: root.pageId })) as {
      deletedCount: number;
    };
    expect(result.deletedCount).toBe(2);
    expect(await listPagesForOrg(ORG)).toHaveLength(0);
  });
});
