// Feature flags are runtime-registered : every module that wants to
// declare flags calls `registerFlags(moduleName, { ... })` at api
// boot. Core modules register through `registerCoreFeatureFlags()` in
// `services/api/src/server.ts` ; extended modules register their own.
// The previous static `FLAGS` const has been retired so non-core
// modules can join the registry without modifying core.
//
// Flag identity is the pair (module, key). At call sites we accept the
// dotted form `"<module>.<key>"` for ergonomics ; the first dot
// separates module from key, and keys themselves may not contain dots.

export type FlagDef = {
  description: string;
  defaultOn: boolean;
  critical?: boolean;
};

export type FlagDescriptor = {
  module: string;
  key: string;
  description: string;
  defaultOn: boolean;
  critical?: boolean;
};

export type FlagScope = {
  organizationId?: string;
  userId?: string;
  roleId?: string;
};

// A flag key in dotted form `"<module>.<key>"`. Kept as a plain string
// alias because the registry is built at runtime ; callers who want
// narrowing can do `const FLAG_X = "auth.trusted-devices" as const`.
export type FlagKey = string;

const MODULE_RE = /^[a-z][a-z0-9-]*$/;
const KEY_RE = /^[a-z][a-z0-9_-]*$/;

const registry = new Map<string, Map<string, FlagDef>>();

export function registerFlags(module: string, flags: Record<string, FlagDef>): void {
  if (!MODULE_RE.test(module)) {
    throw new Error(`Invalid feature-flag module name : ${module}`);
  }
  let bucket = registry.get(module);
  if (!bucket) {
    bucket = new Map<string, FlagDef>();
    registry.set(module, bucket);
  }
  for (const [key, def] of Object.entries(flags)) {
    if (!KEY_RE.test(key)) {
      throw new Error(`Invalid feature-flag key : "${module}.${key}"`);
    }
    bucket.set(key, def);
  }
}

export function isKnownFlag(dotted: string): boolean {
  const parsed = parseFlagKey(dotted);
  if (!parsed) return false;
  return registry.get(parsed.module)?.has(parsed.key) ?? false;
}

export function getFlagDef(dotted: string): FlagDef | undefined {
  const parsed = parseFlagKey(dotted);
  if (!parsed) return undefined;
  return registry.get(parsed.module)?.get(parsed.key);
}

export function listFlagKeys(): string[] {
  return listFlagDescriptors().map((d) => `${d.module}.${d.key}`);
}

export function listFlagDescriptors(): FlagDescriptor[] {
  const out: FlagDescriptor[] = [];
  for (const [module, bucket] of registry) {
    for (const [key, def] of bucket) {
      out.push({ module, key, ...def });
    }
  }
  out.sort((a, b) => `${a.module}.${a.key}`.localeCompare(`${b.module}.${b.key}`));
  return out;
}

export function parseFlagKey(dotted: string): { module: string; key: string } | null {
  const i = dotted.indexOf(".");
  if (i <= 0 || i === dotted.length - 1) return null;
  return { module: dotted.slice(0, i), key: dotted.slice(i + 1) };
}

export function _resetFlagRegistryForTesting(): void {
  registry.clear();
}

export const FLAG_FLIPPED = "feature-flag.flipped" as const;
