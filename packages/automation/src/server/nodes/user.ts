import { z } from "zod";
import {
  getByEmail,
  getById,
  setDisabledAt,
  setUserMetadataValue,
  updateProfileData,
} from "@monark/users/server";
import { isMember } from "@monark/organizations/server";
import type { NodeExecutionContext } from "../registry";
import { defineNode } from "../registry";
import { parseJsonValue, requireOwnerPermission } from "./shared";

/**
 * Assert a target user id is a member of the run's org. User accounts are a
 * global core entity, so a node that writes to a caller-supplied `userId` must
 * scope it to the automation's own org — otherwise an owner with an org-level
 * capability (e.g. `users.disable`) could act on any user platform-wide,
 * including other tenants. Throws a not-found-style error (no existence leak).
 */
async function requireTargetInOrg(ctx: NodeExecutionContext, userId: string): Promise<void> {
  if (!(await isMember(userId, ctx.organizationId))) {
    throw new Error(`User "${userId}" is not a member of this organization.`);
  }
}

/**
 * Look up a user by id or email ; the profile is exposed for downstream nodes.
 * Read-only, so ungated (mirrors the plain `getById` server fn). Note: user
 * creation lives in `@monark/auth` (Supabase) and profile writes aren't
 * exported from `@monark/users/server`, so those aren't nodes yet.
 */
export const userGetNode = defineNode({
  descriptor: {
    kind: "action",
    category: "user",
    label: "Get User",
    description: "Look up a user by id or email.",
    icon: "UserSearch",
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "id", type: "string", description: "The user's id." },
      { key: "email", type: "string", description: "The user's email." },
      { key: "displayName", type: "string", description: "The user's display name." },
    ],
    configFields: [
      {
        key: "lookupBy",
        label: "Look up by",
        type: "select",
        required: true,
        options: [
          { value: "id", label: "User id" },
          { value: "email", label: "Email" },
        ],
      },
      { key: "value", label: "Value", type: "text", required: true },
    ],
  },
  configSchema: z.object({ lookupBy: z.enum(["id", "email"]), value: z.string().min(1) }),
  execute: async (ctx, config) => {
    const user =
      config.lookupBy === "email" ? await getByEmail(config.value) : await getById(config.value);
    // Scope to the run's org so this can't be a cross-org directory oracle: a
    // non-member (or missing) user reports identically, leaking no existence.
    if (!user || !(await isMember(user.id, ctx.organizationId))) {
      throw new Error(`No user found for ${config.lookupBy} "${config.value}" in this org.`);
    }
    return { id: user.id, email: user.email, displayName: user.displayName };
  },
});

/**
 * Set a user-metadata value (the generic per-user JSON sidecar). Gated by the
 * owning module's write-metadata permission, exactly like the metadata tRPC
 * procedures.
 */
export const userSetMetadataNode = defineNode({
  descriptor: {
    kind: "action",
    category: "user",
    label: "Set User Metadata",
    description: "Write a value to a user's metadata sidecar.",
    icon: "UserCog",
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "ok", type: "boolean", description: "Whether the metadata was written." },
    ],
    configFields: [
      { key: "userId", label: "User", type: "user", required: true },
      { key: "module", label: "Module", type: "text", required: true, placeholder: "posts" },
      { key: "key", label: "Key", type: "text", required: true },
      { key: "value", label: "Value (JSON or text)", type: "textarea", required: true },
    ],
  },
  configSchema: z.object({
    userId: z.string().min(1),
    module: z.string().min(1),
    key: z.string().min(1),
    value: z.unknown(),
  }),
  execute: async (ctx, config) => {
    await requireOwnerPermission(ctx, `users.write-metadata-for-module-${config.module}`);
    await requireTargetInOrg(ctx, config.userId);
    await setUserMetadataValue({
      userId: config.userId,
      module: config.module,
      key: config.key,
      value: parseJsonValue(config.value),
    });
    return { ok: true };
  },
});

/**
 * Update a user's profile fields (display name / bio / locale). Gated by
 * `users.manage-profile`. Only provided fields change ; blanks are skipped so
 * an empty box doesn't wipe an existing value.
 */
export const userUpdateProfileNode = defineNode({
  descriptor: {
    kind: "action",
    category: "user",
    label: "Update User Profile",
    description: "Edit a user's display name, bio, or locale.",
    icon: "UserPen",
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "id", type: "string", description: "The updated user's id." },
      { key: "displayName", type: "string", description: "The user's new display name." },
    ],
    configFields: [
      { key: "userId", label: "User", type: "user", required: true },
      { key: "displayName", label: "Display name", type: "text" },
      { key: "bio", label: "Bio", type: "textarea" },
      { key: "localePreference", label: "Locale (en / fr)", type: "text" },
    ],
  },
  configSchema: z.object({
    userId: z.string().min(1),
    displayName: z.string().optional(),
    bio: z.string().optional(),
    localePreference: z.string().optional(),
  }),
  execute: async (ctx, config) => {
    await requireOwnerPermission(ctx, "users.manage-profile");
    await requireTargetInOrg(ctx, config.userId);
    const patch: {
      displayName?: string;
      bio?: string;
      localePreference?: string;
    } = {};
    if (config.displayName != null && config.displayName !== "")
      patch.displayName = config.displayName;
    if (config.bio != null && config.bio !== "") patch.bio = config.bio;
    if (config.localePreference != null && config.localePreference !== "") {
      patch.localePreference = config.localePreference;
    }
    const user = await updateProfileData(config.userId, patch);
    return { id: user.id, displayName: user.displayName };
  },
});

/**
 * Disable or re-enable a user account (admin lockout). Gated by `users.disable`.
 * Distinct from account deletion ; indefinite and reversible.
 */
export const userSetActiveNode = defineNode({
  descriptor: {
    kind: "action",
    category: "user",
    label: "Deactivate / Reactivate User",
    description: "Disable or re-enable a user account.",
    icon: "UserX",
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "userId", type: "string", description: "The affected user's id." },
      { key: "disabled", type: "boolean", description: "True if the user was deactivated." },
    ],
    configFields: [
      { key: "userId", label: "User", type: "user", required: true },
      {
        key: "action",
        label: "Action",
        type: "select",
        required: true,
        options: [
          { value: "disable", label: "Deactivate" },
          { value: "enable", label: "Reactivate" },
        ],
      },
    ],
  },
  configSchema: z.object({ userId: z.string().min(1), action: z.enum(["disable", "enable"]) }),
  execute: async (ctx, config) => {
    await requireOwnerPermission(ctx, "users.disable");
    await requireTargetInOrg(ctx, config.userId);
    await setDisabledAt(config.userId, config.action === "disable" ? new Date() : null);
    return { userId: config.userId, disabled: config.action === "disable" };
  },
});
