import { z } from "zod";
import { assignRole, getAllAssignments, listRolesForOrg, revokeRole } from "@monark/rbac/server";
import { defineNode } from "../registry";
import { requireOwnerPermission } from "./shared";

/** Assign an org role (by key) to a user. */
export const rbacAssignRoleNode = defineNode({
  descriptor: {
    kind: "action",
    category: "rbac",
    label: "Assign Role",
    description: "Grant an org role to a user.",
    icon: "ShieldPlus",
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    configFields: [
      { key: "userId", label: "User", type: "user", required: true },
      { key: "roleKey", label: "Role key", type: "text", required: true, placeholder: "editor" },
    ],
  },
  configSchema: z.object({ userId: z.string().min(1), roleKey: z.string().min(1) }),
  execute: async (ctx, config) => {
    const actorId = await requireOwnerPermission(ctx, "rbac.assign-role");
    const roles = await listRolesForOrg(ctx.organizationId);
    const role = roles.find((r) => r.key === config.roleKey);
    if (!role) throw new Error(`No grantable role with key "${config.roleKey}" in this org.`);
    const result = await assignRole({
      userId: config.userId,
      roleId: role.id,
      organizationId: ctx.organizationId,
      grantedById: actorId,
      reason: "automation",
    });
    ctx.log(
      result.alreadyActive
        ? `User already holds "${config.roleKey}" — no change.`
        : `Granted "${config.roleKey}" to the user.`,
    );
    return { assignmentId: result.assignmentId, alreadyActive: result.alreadyActive };
  },
});

/** Revoke an org role (by key) from a user. */
export const rbacRemoveRoleNode = defineNode({
  descriptor: {
    kind: "action",
    category: "rbac",
    label: "Remove Role",
    description: "Revoke an org role from a user.",
    icon: "ShieldMinus",
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    configFields: [
      { key: "userId", label: "User", type: "user", required: true },
      { key: "roleKey", label: "Role key", type: "text", required: true },
    ],
  },
  configSchema: z.object({ userId: z.string().min(1), roleKey: z.string().min(1) }),
  execute: async (ctx, config) => {
    const actorId = await requireOwnerPermission(ctx, "rbac.assign-role");
    const assignments = await getAllAssignments(config.userId);
    const match = assignments.find(
      (a) => a.role.key === config.roleKey && a.organizationId === ctx.organizationId,
    );
    if (!match) {
      throw new Error(`User has no active "${config.roleKey}" role in this org.`);
    }
    await revokeRole(match.id, actorId, "automation");
    ctx.log(`Revoked "${config.roleKey}" from the user.`);
    return { revoked: true, roleKey: config.roleKey };
  },
});
