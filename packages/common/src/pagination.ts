/**
 * Cursor (keyset) pagination — the shared convention for every "GET ALL"
 * list method in the monorepo. A paginated data-layer function takes
 * {@link PaginationArgs} (`{ limit?, cursor? }`) and returns a
 * {@link Paginated} envelope (`{ items, nextCursor, total }`).
 *
 * - **Cursor**, not offset : the `cursor` is the `id` of the last row of the
 *   previous page. Ordering must be stable and end in `id` (e.g.
 *   `orderBy: [{ updatedAt: "desc" }, { id: "desc" }]`) so the keyset is
 *   deterministic.
 * - **`nextCursor`** is the id to pass as `cursor` for the following page, or
 *   `null` when the current page is the last.
 * - **`total`** is the full count of rows matching the same filter (ignoring
 *   the page window), so a UI can render "Showing 1–25 of 340". It costs one
 *   extra `count()` per fetch ; run it alongside the page query.
 *
 * Reference implementation : `packages/data-models/src/server/data.ts`
 * (`listDataModels` / `listDataRecords`).
 */

/** Default page size when a caller does not specify one. */
export const DEFAULT_PAGE_SIZE = 25;
/** Hard upper bound on a requested page size (guards against unbounded scans). */
export const MAX_PAGE_SIZE = 100;
/** Page-size choices offered by the shared table footer. */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

/** The `{ limit?, cursor? }` input accepted by a paginated list method. */
export type PaginationArgs = {
  /** Page size ; clamped to `[1, MAX_PAGE_SIZE]`. Defaults to `DEFAULT_PAGE_SIZE`. */
  limit?: number;
  /** Id of the last row of the previous page ; omit / null for the first page. */
  cursor?: string | null;
};

/** The envelope every paginated list method returns. */
export type Paginated<T> = {
  items: T[];
  /** Id to pass as `cursor` for the next page, or `null` when this is the last. */
  nextCursor: string | null;
  /** Total rows matching the same filter, across all pages. */
  total: number;
};

/** Clamp a requested limit into the allowed range, applying the default. */
export function resolveLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(1, Math.trunc(limit)), MAX_PAGE_SIZE);
}

/**
 * Prisma `findMany` args for a keyset page : over-fetch one row so the
 * presence of an extra row signals "there is a next page". Spread into the
 * query alongside `where` / `orderBy` / `include`.
 */
export function cursorFindArgs(
  limit: number,
  cursor?: string | null,
): { take: number; cursor?: { id: string }; skip?: number } {
  return {
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

/**
 * Slice the over-fetched rows (from {@link cursorFindArgs}) down to the page
 * and derive `nextCursor`. Pass the row list, the total `count()`, and the
 * resolved `limit`.
 */
export function toPage<T extends { id: string }>(
  rows: T[],
  total: number,
  limit: number,
): Paginated<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? last.id : null,
    total,
  };
}
