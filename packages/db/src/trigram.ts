import { Prisma } from "@prisma/client";

// Trigram (pg_trgm) fuzzy-search building blocks for raw `$queryRaw` searches.
// Prisma's `contains` can't express `word_similarity` / ranking, so the global
// command-palette sources use these to build a typo-tolerant, relevance-ordered
// match over one or more text columns. Requires the `pg_trgm` extension + a
// `USING GIN (<col> gin_trgm_ops)` index on each column (the ILIKE half hits it).
//
// Column names (and the optional table alias) are ALWAYS hardcoded identifiers,
// never user input, so interpolating them via `Prisma.raw` is injection-safe ;
// the query text is passed as a bound parameter.

/** word_similarity cut-off : typo / partial tolerant without being too loose. */
export const TRIGRAM_THRESHOLD = 0.3;

function col(name: string, alias?: string): Prisma.Sql {
  return Prisma.raw(alias ? `${alias}."${name}"` : `"${name}"`);
}

// LIKE treats `%` / `_` in the *value* as wildcards, so escape them (and the
// escape char) — the user's raw query is a literal, not a pattern.
function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}

/**
 * A `WHERE` predicate that matches a row when ANY column contains the query as a
 * substring (case-insensitive `ILIKE`) OR is a fuzzy trigram match
 * (`word_similarity > threshold`). Returns a parenthesized `Prisma.Sql`.
 */
export function trigramMatch(
  columns: string[],
  query: string,
  opts?: { threshold?: number; alias?: string },
): Prisma.Sql {
  const threshold = opts?.threshold ?? TRIGRAM_THRESHOLD;
  const like = likePattern(query);
  const parts = columns.flatMap((c) => [
    Prisma.sql`${col(c, opts?.alias)} ILIKE ${like}`,
    Prisma.sql`word_similarity(${query}, ${col(c, opts?.alias)}) > ${threshold}`,
  ]);
  return Prisma.sql`(${Prisma.join(parts, " OR ")})`;
}

/**
 * An `ORDER BY` fragment ranking rows by their best trigram similarity to the
 * query across the columns (descending). Pair with a stable tiebreak (e.g.
 * `"updatedAt" DESC`).
 */
export function trigramOrder(
  columns: string[],
  query: string,
  opts?: { alias?: string },
): Prisma.Sql {
  const sims = columns.map((c) => Prisma.sql`word_similarity(${query}, ${col(c, opts?.alias)})`);
  return Prisma.sql`GREATEST(${Prisma.join(sims, ", ")}) DESC`;
}
