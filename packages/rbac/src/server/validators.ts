import { ValidationError } from "@monark/common";
import { ADMIN_ROLE_KEY, SYSADMIN_ROLE_KEY } from "../contracts/role";
import { isKnownPermission, parsePermissionKey } from "../contracts/permissions";

const KEY_RE = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/;
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Validates a role color : either `null` / `undefined` / empty string
 * (which all map to "no color set") or a `#RGB` / `#RRGGBB` hex code.
 * Whitespace is trimmed before validation. Anything else throws
 * ValidationError so the caller can surface a clean error to the UI.
 */
export function validateColor(color: string | null | undefined): string | null {
  if (color === null || color === undefined) return null;
  const trimmed = color.trim();
  if (trimmed === "") return null;
  if (!HEX_RE.test(trimmed)) {
    throw new ValidationError("Color must be a hex code like #F0870C or #fff.");
  }
  return trimmed;
}

/**
 * Validates a role key : 2–60 chars, lowercase alnum / dash /
 * underscore, must start + end with alnum (no leading / trailing
 * separators), and reserved built-in keys are forbidden so an
 * operator can't create a custom role that collides with the
 * code-side guards. Returns the trimmed + lowercased key.
 */
export function validateRoleKey(key: string): string {
  const trimmed = key.trim().toLowerCase();
  if (trimmed.length < 2 || trimmed.length > 60) {
    throw new ValidationError("Role key must be 2–60 characters.");
  }
  if (!KEY_RE.test(trimmed)) {
    throw new ValidationError(
      "Role key must use lowercase letters, digits, dashes, or underscores.",
    );
  }
  if (trimmed === ADMIN_ROLE_KEY.toLowerCase() || trimmed === SYSADMIN_ROLE_KEY.toLowerCase()) {
    throw new ValidationError(`The role key "${trimmed}" is reserved.`);
  }
  return trimmed;
}

export type ValidatedPermission = { module: string; key: string };

/**
 * Validates a list of dotted permission keys : every entry must be a
 * known permission (registered via `registerPermissions()` at boot),
 * duplicates are silently de-duped (first-seen wins), and the input
 * order is preserved. Throws ValidationError on the first unknown key
 * so the caller learns which one is wrong. Returns the parsed
 * `{ module, key }` pairs ready for DB insertion.
 */
export function validatePermissionList(permissions: readonly string[]): ValidatedPermission[] {
  const seen = new Set<string>();
  const out: ValidatedPermission[] = [];
  for (const dotted of permissions) {
    if (!isKnownPermission(dotted)) {
      throw new ValidationError(`Unknown permission key : ${dotted}`);
    }
    if (seen.has(dotted)) continue;
    seen.add(dotted);
    const parsed = parsePermissionKey(dotted);
    if (!parsed) {
      // unreachable — isKnownPermission already validated parsability
      continue;
    }
    out.push(parsed);
  }
  return out;
}
