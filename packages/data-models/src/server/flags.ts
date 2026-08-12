import { registerFlags } from "@monark/feature-flags/server";

// Feature flags owned by the data-models module (namespace `data-models.*`).
const DATA_MODELS_FLAGS = {
  "query-language": {
    description:
      "The structured query language (MonarkQL) on the record list — advanced operators, boolean groups, and the text query bar. Off falls back to the classic filter menu.",
    defaultOn: false,
  },
  "public-forms": {
    description:
      "Public form sharing — expose a subset of a Data Model's fields so anonymous (shareable link) or email-invited people can submit records. Off hides the sharing UI and rejects public submissions.",
    defaultOn: false,
  },
} as const;

export function registerDataModelsFeatureFlags(): void {
  registerFlags("data-models", DATA_MODELS_FLAGS);
}
