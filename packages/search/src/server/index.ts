import { z } from "zod";
import { router, publicProcedure } from "@monark/common/trpc";
import { UnauthorizedError, listSearchSources, logger, type SearchHit } from "@monark/common";

// Public surface of @monark/search/server.
// The unified command-palette search : one procedure that fans out across every
// registered search source (see @monark/common's search-registry) and returns
// results grouped by module. Modules contribute by calling `registerSearchSource`
// at boot ; this router has NO dependency on them — it only lists + runs sources.

/** Max hits per source per query — each source is bounded so one can't dominate. */
const PER_SOURCE_LIMIT = 8;

export interface SearchGroup {
  groupId: string;
  module: string;
  hits: SearchHit[];
}

export const searchRouter = router({
  /**
   * Global search across all registered sources. Each source scopes itself
   * (its own org + permission checks) ; a source that throws (incl. a
   * permission-denied) is logged and contributes no hits, so one failing source
   * never fails the whole search. Empty groups are dropped.
   */
  global: publicProcedure
    .input(z.object({ query: z.string().trim().min(2).max(200) }))
    .query(async ({ ctx, input }): Promise<SearchGroup[]> => {
      if (!ctx.userId) throw new UnauthorizedError();
      const groups = await Promise.all(
        listSearchSources().map(async (source): Promise<SearchGroup> => {
          try {
            const hits = await source.run(ctx, input.query, PER_SOURCE_LIMIT);
            return { groupId: source.groupId, module: source.module, hits };
          } catch (err) {
            logger.error({ err, source: source.groupId }, "global search source failed");
            return { groupId: source.groupId, module: source.module, hits: [] };
          }
        }),
      );
      return groups.filter((g) => g.hits.length > 0);
    }),
});
