import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import {
  createPage,
  duplicatePage,
  findPageById,
  getAncestors,
  listPagesForOrg,
  movePage,
  restoreSubtree,
  searchPages,
  softDeleteSubtree,
  updatePage,
} from "../../src/server/data";

// Exercises the wiki data layer against a real Postgres testcontainer, focused
// on the load-bearing tree logic : sibling `position` in gaps of 10, the
// adjacency-list ancestor / subtree walks, the move cycle-guard, and that a
// soft-delete / restore takes the whole subtree with it.

const ORG = "wiki-org";
const OTHER_ORG = "wiki-other-org";
const USER = "wiki-user";

/** A minimal BlockNote document : one paragraph holding `text`. */
function paragraph(text: string) {
  return [{ type: "paragraph", content: [{ type: "text", text, styles: {} }], children: [] }];
}

beforeAll(async () => {
  for (const id of [ORG, OTHER_ORG]) {
    await getDb().organization.upsert({
      where: { id },
      create: { id, slug: id, displayName: id },
      update: {},
    });
  }
});

afterEach(async () => {
  await truncate(getDb(), ["WikiPage"]);
});

afterAll(async () => {
  for (const id of [ORG, OTHER_ORG]) {
    await getDb()
      .organization.delete({ where: { id } })
      .catch(() => {});
  }
});

describe("wiki data layer", () => {
  it("assigns sibling positions in gaps of 10", async () => {
    const a = await createPage({
      organizationId: ORG,
      parentId: null,
      title: "A",
      createdBy: USER,
    });
    const b = await createPage({
      organizationId: ORG,
      parentId: null,
      title: "B",
      createdBy: USER,
    });
    const c = await createPage({
      organizationId: ORG,
      parentId: null,
      title: "C",
      createdBy: USER,
    });
    expect([a.position, b.position, c.position]).toEqual([10, 20, 30]);
  });

  it("nests children and walks the root-first ancestor chain", async () => {
    const root = await createPage({
      organizationId: ORG,
      parentId: null,
      title: "Root",
      createdBy: USER,
    });
    const child = await createPage({
      organizationId: ORG,
      parentId: root.id,
      title: "Child",
      createdBy: USER,
    });
    const grandchild = await createPage({
      organizationId: ORG,
      parentId: child.id,
      title: "Grandchild",
      createdBy: USER,
    });

    const tree = await listPagesForOrg(ORG);
    expect(tree.find((n) => n.id === grandchild.id)?.parentId).toBe(child.id);

    const ancestors = await getAncestors(ORG, grandchild.id);
    expect(ancestors.map((a) => a.id)).toEqual([root.id, child.id]);
  });

  it("reparents a page and reindexes the target sibling list", async () => {
    const p1 = await createPage({
      organizationId: ORG,
      parentId: null,
      title: "P1",
      createdBy: USER,
    });
    const p2 = await createPage({
      organizationId: ORG,
      parentId: null,
      title: "P2",
      createdBy: USER,
    });

    await movePage({ organizationId: ORG, pageId: p2.id, newParentId: p1.id, beforeId: null });

    const moved = await findPageById(p2.id);
    expect(moved?.parentId).toBe(p1.id);
    expect(moved?.position).toBe(POSITION_OF_FIRST_CHILD);
  });

  it("inserts before a target sibling on move", async () => {
    const parent = await createPage({
      organizationId: ORG,
      parentId: null,
      title: "Parent",
      createdBy: USER,
    });
    const a = await createPage({
      organizationId: ORG,
      parentId: parent.id,
      title: "A",
      createdBy: USER,
    });
    const b = await createPage({
      organizationId: ORG,
      parentId: parent.id,
      title: "B",
      createdBy: USER,
    });
    const loose = await createPage({
      organizationId: ORG,
      parentId: null,
      title: "Loose",
      createdBy: USER,
    });

    // Move `loose` under `parent`, before `b` -> order becomes A, loose, B.
    await movePage({
      organizationId: ORG,
      pageId: loose.id,
      newParentId: parent.id,
      beforeId: b.id,
    });

    const children = (await listPagesForOrg(ORG))
      .filter((n) => n.parentId === parent.id)
      .sort((x, y) => x.position - y.position)
      .map((n) => n.id);
    expect(children).toEqual([a.id, loose.id, b.id]);
  });

  it("rejects moving a page under its own descendant (cycle guard)", async () => {
    const root = await createPage({
      organizationId: ORG,
      parentId: null,
      title: "Root",
      createdBy: USER,
    });
    const child = await createPage({
      organizationId: ORG,
      parentId: root.id,
      title: "Child",
      createdBy: USER,
    });

    await expect(
      movePage({ organizationId: ORG, pageId: root.id, newParentId: child.id, beforeId: null }),
    ).rejects.toThrow();

    // The tree is untouched by the rejected move.
    expect((await findPageById(root.id))?.parentId).toBeNull();
    expect((await findPageById(child.id))?.parentId).toBe(root.id);
  });

  it("soft-deletes a whole subtree and restores it", async () => {
    const root = await createPage({
      organizationId: ORG,
      parentId: null,
      title: "Root",
      createdBy: USER,
    });
    const child = await createPage({
      organizationId: ORG,
      parentId: root.id,
      title: "Child",
      createdBy: USER,
    });
    const grandchild = await createPage({
      organizationId: ORG,
      parentId: child.id,
      title: "Grandchild",
      createdBy: USER,
    });

    const removed = await softDeleteSubtree(ORG, root.id);
    expect(new Set(removed)).toEqual(new Set([root.id, child.id, grandchild.id]));
    expect(await listPagesForOrg(ORG)).toHaveLength(0);

    const restored = await restoreSubtree(ORG, root.id);
    expect(new Set(restored)).toEqual(new Set([root.id, child.id, grandchild.id]));
    expect(await listPagesForOrg(ORG)).toHaveLength(3);
  });

  it("duplicates a page as a new sibling", async () => {
    const page = await createPage({
      organizationId: ORG,
      parentId: null,
      title: "Runbook",
      createdBy: USER,
    });
    const withContent = await updatePage(page.id, { content: paragraph("steps"), updatedBy: USER });

    const copy = await duplicatePage(withContent, USER);
    expect(copy.id).not.toBe(page.id);
    expect(copy.title).toBe("Runbook");
    // The block array + its derived plain text both copy across.
    expect(copy.content).toEqual(paragraph("steps"));
    expect(copy.contentText).toBe("steps");
    expect(copy.parentId).toBeNull();
    expect(await listPagesForOrg(ORG)).toHaveLength(2);
  });

  it("searches title and content, scoped to the org", async () => {
    const page = await createPage({
      organizationId: ORG,
      parentId: null,
      title: "Runbook",
      createdBy: USER,
    });
    // Search matches the derived `contentText`, kept in sync on write.
    await updatePage(page.id, { content: paragraph("deploy steps"), updatedBy: USER });
    // A same-named page in another org must never leak into ORG's results.
    await createPage({
      organizationId: OTHER_ORG,
      parentId: null,
      title: "Runbook",
      createdBy: USER,
    });

    expect((await searchPages(ORG, "runbook")).map((r) => r.id)).toEqual([page.id]);
    expect((await searchPages(ORG, "deploy")).map((r) => r.id)).toEqual([page.id]);
    expect(await searchPages(ORG, "nonexistent")).toHaveLength(0);
  });

  it("is fuzzy — a typo'd query still matches (pg_trgm trigram)", async () => {
    const page = await createPage({
      organizationId: ORG,
      parentId: null,
      title: "Runbook",
      createdBy: USER,
    });
    // "runbok" (dropped an 'o') isn't a substring of "Runbook", so this only
    // matches via trigram similarity — the whole point of the fuzzy search.
    expect((await searchPages(ORG, "runbok")).map((r) => r.id)).toContain(page.id);
  });
});

// The first child of a freshly-created parent lands at one POSITION_STEP.
const POSITION_OF_FIRST_CHILD = 10;
