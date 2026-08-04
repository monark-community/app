/**
 * Node slugs — the stable, human, unique-within-a-graph handle used to address
 * a node's output as `{{ steps.<slug>.field }}`. The editor assigns one to every
 * node (derived from its label, de-duplicated) and lets the author edit it ; the
 * engine reads `NodeInstance.slug` to build the `steps` scope. Kept here so the
 * derivation is a single shared, unit-tested contract rather than living in the
 * editor alone.
 */

/** A valid node slug: lowercase, starts with a letter, `[a-z0-9_]` thereafter. */
export const NODE_SLUG_RE = /^[a-z][a-z0-9_]*$/;

const MAX_SLUG_LENGTH = 48;

/**
 * Derive a base slug from a human label (`"Find Record"` -> `"find_record"`).
 * Lowercases, collapses every non-alphanumeric run to a single `_`, trims
 * leading/trailing `_`, and guarantees the result starts with a letter (a
 * leading digit or an empty result is prefixed with `n_`). Never returns an
 * empty string, so it is always a legal identifier. De-duplication against the
 * rest of the graph is a separate step ({@link uniqueNodeSlug}).
 */
export function slugifyLabel(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_SLUG_LENGTH);
  if (base === "" || !/^[a-z]/.test(base)) return `n_${base}`.slice(0, MAX_SLUG_LENGTH);
  return base;
}

/**
 * Make `base` unique against the already-taken slugs by appending `_2`, `_3`, …
 * until it no longer collides. `base` is returned unchanged when it is free.
 */
export function uniqueNodeSlug(base: string, taken: Iterable<string>): string {
  const used = taken instanceof Set ? taken : new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}_${i}`;
    if (!used.has(candidate)) return candidate;
  }
}
