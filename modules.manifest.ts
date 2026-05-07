export const MODULES = {
  "@monark/auth": { tier: "core" },
  "@monark/branding": { tier: "core" },
  "@monark/feature-flags": { tier: "core" },
  "@monark/users": { tier: "core" },
  "@monark/organizations": { tier: "core" },
  "@monark/rbac": { tier: "core" },
  "@monark/notifications": { tier: "core" },
} as const satisfies Record<string, { tier: "core" | "extended" }>

export type ModuleName = keyof typeof MODULES
export type ModuleTier = "core" | "extended"

export function getModuleTier(name: string): ModuleTier | undefined {
  const entry = (MODULES as Record<string, { tier: ModuleTier }>)[name]
  return entry?.tier
}

export function listModules(tier?: ModuleTier): string[] {
  const entries = Object.entries(MODULES) as Array<[string, { tier: ModuleTier }]>
  const filtered = tier ? entries.filter(([, meta]) => meta.tier === tier) : entries
  return filtered.map(([name]) => name).sort()
}
