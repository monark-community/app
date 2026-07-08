// Permissions are runtime-registered : every module that wants to
// declare permissions calls `registerPermissions(moduleName, { ... })`
// at api boot. Core modules each register their own slice ; extended
// modules join the same registry without modifying core code.
//
// Permission identity is the pair (module, key). At call sites we
// accept the dotted form `"<module>.<key>"` for ergonomics ; the first
// dot separates module from key, and keys themselves may not contain
// dots. Two modules can declare a key with the same suffix without
// colliding because the unique key on `RolePermission` is
// (roleId, module, permission).
//
// Built-in `ADMIN` short-circuits to "all permissions" in code
// regardless of what's in the DB, so adding a permission here
// automatically grants it to admins without a data backfill.

// Categories are loose strings, not a fixed enum, so an extended
// module can introduce its own grouping (e.g. `"posts"`) without
// modifying core. The /admin/rbac surface renders whatever categories
// turn up in the merged registry.
export type PermissionCategory = string;

export type PermissionDef = {
  description: string;
  category: PermissionCategory;
  /**
   * When true, this permission is org-scoped content — e.g. a per-Data-Model
   * record permission whose `<key>` names a specific model. The key itself is
   * still process-global and shared across orgs (two orgs with the same model
   * key map to one registry entry, which is fine — enforcement scopes by the
   * model's org), so it stays grantable everywhere and `isKnownPermission`
   * passes. But the `/admin/rbac` catalog only SHOWS it to an org that a
   * registered visibility resolver reports it visible for, so one org's model
   * keys don't surface in another org's permission picker.
   */
  orgScoped?: boolean;
};

export type PermissionDescriptor = {
  module: string;
  key: string;
  description: string;
  category: PermissionCategory;
};

// Dotted form `"<module>.<key>"`. Plain string alias because the
// registry is dynamic at runtime ; callers wanting narrowing can
// declare their own const e.g. `const PERM_X = "rbac.manage-roles" as const`.
export type Permission = string;

const MODULE_RE = /^[a-z][a-z0-9-]*$/;
const KEY_RE = /^[a-z][a-z0-9_-]*$/;

const registry = new Map<string, Map<string, PermissionDef>>();

export function registerPermissions(module: string, perms: Record<string, PermissionDef>): void {
  if (!MODULE_RE.test(module)) {
    throw new Error(`Invalid permission module name : ${module}`);
  }
  let bucket = registry.get(module);
  if (!bucket) {
    bucket = new Map<string, PermissionDef>();
    registry.set(module, bucket);
  }
  for (const [key, def] of Object.entries(perms)) {
    if (!KEY_RE.test(key)) {
      throw new Error(`Invalid permission key : "${module}.${key}"`);
    }
    bucket.set(key, def);
  }
}

export function isKnownPermission(dotted: string): boolean {
  const parsed = parsePermissionKey(dotted);
  if (!parsed) return false;
  return registry.get(parsed.module)?.has(parsed.key) ?? false;
}

export function getPermissionDef(dotted: string): PermissionDef | undefined {
  const parsed = parsePermissionKey(dotted);
  if (!parsed) return undefined;
  return registry.get(parsed.module)?.get(parsed.key);
}

export function listPermissions(): Permission[] {
  return listPermissionDescriptors().map((d) => `${d.module}.${d.key}`);
}

export function listPermissionDescriptors(): PermissionDescriptor[] {
  const out: PermissionDescriptor[] = [];
  for (const [module, bucket] of registry) {
    for (const [key, def] of bucket) {
      out.push({ module, key, ...def });
    }
  }
  out.sort((a, b) => `${a.module}.${a.key}`.localeCompare(`${b.module}.${b.key}`));
  return out;
}

// Convenience for the /admin/rbac matrix : grouped by category.
// Categories appear in alphabetical order ; permissions inside each
// category are dotted and sorted alphabetically.
export function permissionsByCategory(): Record<PermissionCategory, Permission[]> {
  const grouped: Record<PermissionCategory, Permission[]> = {};
  for (const desc of listPermissionDescriptors()) {
    const dotted = `${desc.module}.${desc.key}`;
    const bucket = grouped[desc.category] ?? [];
    bucket.push(dotted);
    grouped[desc.category] = bucket;
  }
  return grouped;
}

export function parsePermissionKey(dotted: string): { module: string; key: string } | null {
  const i = dotted.indexOf(".");
  if (i <= 0 || i === dotted.length - 1) return null;
  return { module: dotted.slice(0, i), key: dotted.slice(i + 1) };
}

// ── Org-scoped permission visibility ─────────────────────────────────
// Resolvers report which `orgScoped` permission dotted keys are visible to a
// given org in the /admin/rbac catalog. This keeps rbac ignorant of the
// modules that own org-scoped permissions (e.g. @monark/data-models, whose
// per-model keys depend on that org's live models) — they push a resolver at
// boot rather than rbac importing them (which would be a layering cycle). The
// permissions stay globally registered (so `isKnownPermission` + grant-time
// validation pass) ; the resolver only gates DISPLAY.

export type OrgScopedPermissionResolver = (
  organizationId: string,
) => Promise<Iterable<string>> | Iterable<string>;

const orgScopedResolvers: OrgScopedPermissionResolver[] = [];

export function registerOrgScopedPermissionVisibility(resolver: OrgScopedPermissionResolver): void {
  orgScopedResolvers.push(resolver);
}

// Union of every resolver's visible keys for this org. Returns an empty set
// for a null org (e.g. a sysadmin viewing the platform context), which hides
// all `orgScoped` permissions rather than leaking them.
export async function orgVisiblePermissionKeys(
  organizationId: string | null,
): Promise<Set<string>> {
  const visible = new Set<string>();
  if (organizationId === null) return visible;
  for (const resolve of orgScopedResolvers) {
    for (const key of await resolve(organizationId)) visible.add(key);
  }
  return visible;
}

export function _resetPermissionRegistryForTesting(): void {
  registry.clear();
  orgScopedResolvers.length = 0;
}
