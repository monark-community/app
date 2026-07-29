/**
 * Leaf contract shared by the global-search dialog and every content provider.
 * Kept import-free (no provider components, no dialog) so providers can depend
 * on it without forming a cycle with the `search-providers` registry that lists
 * them.
 */

/** Minimum query length before any search fires (nav filter + content). */
export const SEARCH_MIN_QUERY = 2;

/**
 * Props every content provider receives. `query` is the debounced, trimmed
 * term and is guaranteed to be at least {@link SEARCH_MIN_QUERY} chars long by
 * the time a provider is rendered. `onNavigate` closes the palette and routes
 * to the chosen result.
 */
export type SearchProviderProps = {
  query: string;
  onNavigate: (href: string) => void;
};
