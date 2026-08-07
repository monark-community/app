export const MODULES = {
  "@monark/auth": { tier: "core" },
  "@monark/branding": { tier: "core" },
  "@monark/feature-flags": { tier: "core" },
  "@monark/users": { tier: "core" },
  "@monark/organizations": { tier: "core" },
  "@monark/rbac": { tier: "core" },
  "@monark/notifications": { tier: "core" },
  "@monark/webhooks": { tier: "core" },
  "@monark/files": { tier: "core" },
  "@monark/calendar": { tier: "extended" },
  "@monark/data-models": { tier: "core" },
  "@monark/kanban": { tier: "extended" },
  "@monark/automation": { tier: "core" },
  "@monark/secrets": { tier: "core" },
  "@monark/api-keys": { tier: "core" },
  "@monark/public-api": { tier: "core" },
  "@monark/chat": { tier: "core" },
  // `integrates` marks an extended module as an *integration* of another module
  // (here, the automation engine): it plugs a third-party service in via that
  // module's extension APIs. Grouping + a `check:tiers` rule (the integration
  // must actually depend on its target) live on this metadata, not the folder
  // tree — see docs/technical-documentation/extensibility-contract.md.
  "@monark/github": { tier: "extended", integrates: "@monark/automation" },
  "@monark/discord": { tier: "extended", integrates: "@monark/automation" },
  "@monark/telegram": { tier: "extended", integrates: "@monark/automation" },
  "@monark/twitter": { tier: "extended", integrates: "@monark/automation" },
} as const satisfies Record<string, ModuleMeta>;

export type ModuleName = keyof typeof MODULES;
export type ModuleTier = "core" | "extended";
export type ModuleMeta = { tier: ModuleTier; integrates?: string };

export function getModuleTier(name: string): ModuleTier | undefined {
  const entry = (MODULES as Record<string, ModuleMeta>)[name];
  return entry?.tier;
}

/** The module this one integrates (its extension target), if it's an integration. */
export function getModuleIntegrates(name: string): string | undefined {
  return (MODULES as Record<string, ModuleMeta>)[name]?.integrates;
}

export function listModules(tier?: ModuleTier): string[] {
  const entries = Object.entries(MODULES) as Array<[string, ModuleMeta]>;
  const filtered = tier ? entries.filter(([, meta]) => meta.tier === tier) : entries;
  return filtered.map(([name]) => name).sort();
}

/** Every integration module + the module each integrates. */
export function listIntegrations(): Array<{ name: string; integrates: string }> {
  return (Object.entries(MODULES) as Array<[string, ModuleMeta]>)
    .filter((entry): entry is [string, ModuleMeta & { integrates: string }] =>
      Boolean(entry[1].integrates),
    )
    .map(([name, meta]) => ({ name, integrates: meta.integrates }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
