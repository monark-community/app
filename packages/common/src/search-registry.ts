import type { TrpcContext } from "./trpc";

/**
 * Global-search substrate. A module contributes results to the unified command
 * palette by registering a **search source** at api boot — the same "register at
 * boot, list at query time" pattern as {@link ./event-registry event types} and
 * automation nodes. The core `search.global` fan-out (in `@monark/search`) lists
 * the sources and runs each one, so a new module joins global search without any
 * web or core edit.
 */

/** One result the palette can render + navigate to. */
export interface SearchHit {
  /** Stable id of the underlying entity (React key ; not shown). */
  id: string;
  /** Primary line. */
  title: string;
  /** Optional secondary line (e.g. the board / model the hit belongs to). */
  subtitle?: string;
  /**
   * Optional per-hit glyph rendered before the title — a short string such as a
   * wiki page's emoji. When absent the palette falls back to the source's group
   * icon (a lucide component, a web concern keyed by `groupId`), so icons that are
   * React components never cross the server boundary.
   */
  icon?: string;
  /** App-relative path the palette navigates to on select (built server-side). */
  href: string;
}

/**
 * A registered contributor to global search. `run` reuses the module's existing
 * data-layer search and is responsible for **its own access scoping** — the same
 * `requireOrg` + `requirePermission` / accessible-id resolution the module's per-
 * surface search already does. It should return at most `limit` hits.
 */
export interface SearchSource {
  /** Owning module (namespace), for logs / grouping. */
  module: string;
  /**
   * Stable group id — the result group's React key, its
   * `globalSearch.groups.<groupId>` heading, and the web's icon-map key. Lowercase
   * kebab, must be unique across sources.
   */
  groupId: string;
  /** Canonical English label (a registry string, not i18n) for logs / debugging. */
  label: string;
  /** Run the search, scoped to what `ctx` may see. Returns up to `limit` hits. */
  run: (ctx: TrpcContext, query: string, limit: number) => Promise<SearchHit[]>;
}

const registry = new Map<string, SearchSource>();
const GROUP_ID_RE = /^[a-z][a-z0-9-]*$/;

/**
 * Register a global-search source under its `groupId`. Called once per source at
 * api boot (idempotent — re-registering the same id overwrites, tolerating
 * double-imports / hot reloads).
 */
export function registerSearchSource(source: SearchSource): void {
  if (!GROUP_ID_RE.test(source.groupId)) {
    throw new Error(`Invalid search source groupId "${source.groupId}" (expected ${GROUP_ID_RE}).`);
  }
  registry.set(source.groupId, source);
}

/** Every registered search source, in registration order. */
export function listSearchSources(): SearchSource[] {
  return [...registry.values()];
}

/** Test-only : clear the registry between suites. */
export function _resetSearchRegistryForTesting(): void {
  registry.clear();
}
