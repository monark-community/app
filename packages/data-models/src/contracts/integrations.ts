import type { DataFieldType } from "./field-types";

/**
 * Registry for module-declared "integration slots" — how another module
 * (e.g. Calendar) tells the generic Data Models engine what shape of field
 * it needs mapped onto its own concept (a start time, a target Calendar).
 * Mirrors the `register<Thing>(module, defs)` idiom already used for
 * permissions / feature flags / notification kinds — a merged in-memory
 * catalog, populated once at api boot, read generically by the admin UI.
 *
 * This is the "mapping, not reserved field keys" mechanism described in
 * docs/features-planning/phase-2/polymorphic-db.md : an admin maps their
 * own Data Model's fields into named slots, rather than the engine
 * reserving field key names for system integrations.
 */
export type IntegrationSlotDef = {
  /** Which field types can satisfy this slot. */
  types: DataFieldType[];
  required: boolean;
  /** When `types` includes RELATION, constrain the mapped field's
   * `config.relationTarget` to this value (e.g. "Calendar"). */
  relationTarget?: string;
  description: string;
};

export type ModelIntegrationDef = {
  slots: Record<string, IntegrationSlotDef>;
  description: string;
};

const registry = new Map<string, ModelIntegrationDef>();
const MODULE_RE = /^[a-z][a-z0-9-]*$/;

/** Idempotent — a repeat call with the same module name is a no-op, so
 * hot-reloads / test setups / accidental double-imports don't crash boot. */
export function registerModelIntegration(module: string, def: ModelIntegrationDef): void {
  if (!MODULE_RE.test(module)) {
    throw new Error(`Invalid integration module name: ${module}`);
  }
  if (registry.has(module)) return;
  registry.set(module, def);
}

export function listModelIntegrations(): Array<{ module: string } & ModelIntegrationDef> {
  return Array.from(registry.entries()).map(([module, def]) => ({ module, ...def }));
}

export function getModelIntegrationDef(module: string): ModelIntegrationDef | undefined {
  return registry.get(module);
}

export function _resetModelIntegrationRegistryForTesting(): void {
  registry.clear();
}
