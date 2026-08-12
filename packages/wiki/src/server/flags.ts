import { registerFlags } from "@monark/feature-flags/server";

// Feature flags owned by the wiki module (namespace `wiki.*`).
const WIKI_FLAGS = {
  enabled: {
    description:
      "The wiki (nested pages). Kill switch for the whole feature ; when off, the /wiki route and its primary-nav entry are hidden. Off by default until rolled out.",
    defaultOn: false,
  },
} as const;

export function registerWikiFeatureFlags(): void {
  registerFlags("wiki", WIKI_FLAGS);
}
