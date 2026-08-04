import { registerFlags } from "@monark/feature-flags/server";

// Feature flags owned by the data-models module (namespace `data-models.*`).
const DATA_MODELS_FLAGS = {
  "query-language": {
    description:
      "The structured query language (MonarkQL) on the record list — advanced operators, boolean groups, and the text query bar. Off falls back to the classic filter menu.",
    defaultOn: false,
  },
} as const;

export function registerDataModelsFeatureFlags(): void {
  registerFlags("data-models", DATA_MODELS_FLAGS);
}
