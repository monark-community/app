import { getDb, Prisma, trigramMatch, trigramOrder } from "@monark/db";
import { ValidationError, blocksToText, type DocumentBlock } from "@monark/common";
import type { WikiAncestor, WikiTreeNode } from "../contracts";

// Sibling order in gaps of 10 (the house pattern from kanban / data-models
// reorder), so inserting or moving a page renumbers only its own sibling list.
const POSITION_STEP = 10;
const SEARCH_LIMIT = 12;

export type WikiPageRow = {
  id: string;
  organizationId: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  /** Body as a BlockNote block array (JSON) ; coerced to `Block[]` by the editor. */
  content: unknown;
  /** Plain-text projection of `content`, kept in sync for search + event diffs. */
  contentText: string;
  position: number;
  createdBy: string;
  updatedBy: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const LIGHT_SELECT = {
  id: true,
  parentId: true,
  title: true,
  icon: true,
  position: true,
} as const;

/** Every non-deleted page for an org, light shape, ordered for the sidebar tree. */
export async function listPagesForOrg(organizationId: string): Promise<WikiTreeNode[]> {
  const db = getDb();
  return db.wikiPage.findMany({
    where: { organizationId, deletedAt: null },
    select: LIGHT_SELECT,
    orderBy: [{ parentId: "asc" }, { position: "asc" }, { id: "asc" }],
  });
}

export async function findPageById(
  id: string,
  opts?: { includeDeleted?: boolean },
): Promise<WikiPageRow | null> {
  const db = getDb();
  return db.wikiPage.findFirst({
    where: { id, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
  });
}

/** Root-first ancestor chain of a page, walked over the org's light tree. */
export async function getAncestors(
  organizationId: string,
  pageId: string,
): Promise<WikiAncestor[]> {
  const db = getDb();
  const all = await db.wikiPage.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, parentId: true, title: true, icon: true },
  });
  const byId = new Map(all.map((p) => [p.id, p]));
  const chain: WikiAncestor[] = [];
  const seen = new Set<string>();
  let cur = byId.get(pageId)?.parentId ?? null;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const node = byId.get(cur);
    if (!node) break;
    chain.push({ id: node.id, title: node.title, icon: node.icon });
    cur = node.parentId;
  }
  return chain.reverse();
}

async function nextSiblingPosition(
  organizationId: string,
  parentId: string | null,
): Promise<number> {
  const db = getDb();
  const last = await db.wikiPage.findFirst({
    where: { organizationId, parentId, deletedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? 0) + POSITION_STEP;
}

export async function createPage(input: {
  organizationId: string;
  parentId: string | null;
  title: string;
  icon?: string | null;
  createdBy: string;
}): Promise<WikiPageRow> {
  const db = getDb();
  const position = await nextSiblingPosition(input.organizationId, input.parentId);
  return db.wikiPage.create({
    data: {
      organizationId: input.organizationId,
      parentId: input.parentId,
      title: input.title,
      icon: input.icon ?? null,
      position,
      createdBy: input.createdBy,
    },
  });
}

export async function updatePage(
  id: string,
  patch: { title?: string; icon?: string | null; content?: DocumentBlock[]; updatedBy: string },
): Promise<WikiPageRow> {
  const db = getDb();
  return db.wikiPage.update({
    where: { id },
    data: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
      // Persist the block array and its derived plain text together, so search
      // and event diffs never read a stale projection.
      ...(patch.content !== undefined
        ? {
            content: patch.content as Prisma.InputJsonValue,
            contentText: blocksToText(patch.content),
          }
        : {}),
      updatedBy: patch.updatedBy,
    },
  });
}

/**
 * Ids of a subtree (root + all descendants), computed by walking the org's tree
 * in application code — no recursive CTE. Small per-org trees make this cheap ;
 * graduate to a `WITH RECURSIVE` only if a wiki ever grows very large.
 */
async function collectSubtree(
  organizationId: string,
  rootId: string,
  opts: { includeDeleted: boolean },
): Promise<string[]> {
  const db = getDb();
  const all = await db.wikiPage.findMany({
    where: { organizationId, ...(opts.includeDeleted ? {} : { deletedAt: null }) },
    select: { id: true, parentId: true },
  });
  const childrenOf = new Map<string | null, string[]>();
  for (const p of all) {
    const arr = childrenOf.get(p.parentId) ?? [];
    arr.push(p.id);
    childrenOf.set(p.parentId, arr);
  }
  const ids: string[] = [rootId];
  const seen = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const child of childrenOf.get(id) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        ids.push(child);
        stack.push(child);
      }
    }
  }
  return ids;
}

/**
 * Reparent + reorder a page. Rejects moving a page under itself or one of its
 * descendants (cycle guard). The target parent's whole sibling list is renumbered
 * in a transaction (steps of 10) with the moved page inserted before `beforeId`
 * (or appended when it's null / unknown). The moved page's own subtree rides
 * along — only its `parentId` changes.
 */
export async function movePage(input: {
  organizationId: string;
  pageId: string;
  newParentId: string | null;
  beforeId: string | null;
}): Promise<void> {
  const db = getDb();

  const subtree = await collectSubtree(input.organizationId, input.pageId, {
    includeDeleted: false,
  });
  if (input.newParentId !== null && subtree.includes(input.newParentId)) {
    throw new ValidationError("A page can't be moved under itself or one of its descendants.");
  }

  await db.$transaction(async (tx) => {
    const siblings = await tx.wikiPage.findMany({
      where: {
        organizationId: input.organizationId,
        parentId: input.newParentId,
        deletedAt: null,
        id: { not: input.pageId },
      },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const ordered = siblings.map((s) => s.id);
    const beforeIdx = input.beforeId ? ordered.indexOf(input.beforeId) : -1;
    const insertAt = beforeIdx >= 0 ? beforeIdx : ordered.length;
    ordered.splice(insertAt, 0, input.pageId);
    for (let i = 0; i < ordered.length; i++) {
      await tx.wikiPage.update({
        where: { id: ordered[i]! },
        data: { parentId: input.newParentId, position: (i + 1) * POSITION_STEP },
      });
    }
  });
}

/** Soft-delete a page and its whole subtree ; returns every removed id. */
export async function softDeleteSubtree(organizationId: string, rootId: string): Promise<string[]> {
  const db = getDb();
  const ids = await collectSubtree(organizationId, rootId, { includeDeleted: false });
  await db.wikiPage.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } });
  return ids;
}

/** Restore a soft-deleted page and its subtree ; returns every restored id. */
export async function restoreSubtree(organizationId: string, rootId: string): Promise<string[]> {
  const db = getDb();
  const ids = await collectSubtree(organizationId, rootId, { includeDeleted: true });
  await db.wikiPage.updateMany({ where: { id: { in: ids } }, data: { deletedAt: null } });
  return ids;
}

/** Copy a single page as a new sibling (v1 : the subtree is not copied). */
export async function duplicatePage(source: WikiPageRow, createdBy: string): Promise<WikiPageRow> {
  const db = getDb();
  const position = await nextSiblingPosition(source.organizationId, source.parentId);
  return db.wikiPage.create({
    data: {
      organizationId: source.organizationId,
      parentId: source.parentId,
      title: source.title,
      icon: source.icon,
      content: source.content as Prisma.InputJsonValue,
      contentText: source.contentText,
      position,
      createdBy,
    },
  });
}

/**
 * Fuzzy title + body search across an org's pages — powers the global palette.
 * Trigram (`pg_trgm`) : typo-tolerant, ranked by best similarity across title +
 * `contentText`. `LIGHT_SELECT` shape, via raw SQL (Prisma can't do similarity).
 */
export async function searchPages(organizationId: string, query: string): Promise<WikiTreeNode[]> {
  const columns = ["title", "contentText"];
  return getDb().$queryRaw<WikiTreeNode[]>(Prisma.sql`
    SELECT id, "parentId", title, icon, position
    FROM "WikiPage"
    WHERE "organizationId" = ${organizationId}
      AND "deletedAt" IS NULL
      AND ${trigramMatch(columns, query)}
    ORDER BY ${trigramOrder(columns, query)}, "updatedAt" DESC
    LIMIT ${SEARCH_LIMIT}
  `);
}
