/**
 * Grant or revoke the platform-tier `SYSADMIN` role.
 *
 * The role intentionally has no UI surface — it confers all
 * permissions across every organization and is the operator's
 * "break-glass" tier. Two callers are supported :
 *
 *   pnpm tsx tools/sysadmin.ts grant <userId | email>
 *   pnpm tsx tools/sysadmin.ts revoke <userId | email>
 *   pnpm tsx tools/sysadmin.ts list
 *
 * The script imports `assignRole` / `revokeRole` from
 * `@monark/rbac/server`, so the same scope-validation guards the
 * tRPC layer enforces apply here too. The granter id is recorded as
 * `system:sysadmin-cli` for the audit trail.
 *
 * Run from the repo root (`monark/app/`) with `DATABASE_URL` and
 * `DIRECT_URL` set in the environment, the same envs `services/api`
 * uses. The script does NOT load `.env` itself — invoke via tsx
 * `--env-file=services/api/.env` or export the vars before running.
 */

import { getDb } from "@monark/db";
import { assignRole, findRoleById, revokeRole, SYSADMIN_ROLE_KEY } from "@monark/rbac/server";

const SYSADMIN_ID = "role_sysadmin_builtin";
// System-driven grant : the CLI doesn't run as any particular user
// (there's no "current operator" in a Node process), so the audit
// records `grantedById = NULL`. The schema explicitly allows this
// for system actions ; UI grants always carry a real actor.
const ACTOR_ID = null;

async function resolveUser(query: string): Promise<{ id: string; email: string } | null> {
  const db = getDb();
  // Heuristic : anything containing `@` is treated as an email,
  // otherwise as the User.id (cuid / supabase uuid).
  if (query.includes("@")) {
    const row = await db.user.findUnique({
      where: { email: query.toLowerCase() },
      select: { id: true, email: true },
    });
    return row;
  }
  const row = await db.user.findUnique({
    where: { id: query },
    select: { id: true, email: true },
  });
  return row;
}

async function ensureSysadminRoleExists(): Promise<void> {
  const role = await findRoleById(SYSADMIN_ID);
  if (role && role.builtIn && role.key === SYSADMIN_ROLE_KEY) return;
  throw new Error(
    `SYSADMIN role row (id=${SYSADMIN_ID}) is missing or malformed. Apply the migrations in packages/db/prisma/migrations first.`,
  );
}

async function grant(query: string): Promise<void> {
  await ensureSysadminRoleExists();
  const user = await resolveUser(query);
  if (!user) {
    throw new Error(`No user matched "${query}" (tried email then id).`);
  }
  const result = await assignRole({
    userId: user.id,
    roleId: SYSADMIN_ID,
    organizationId: null,
    grantedById: ACTOR_ID,
    reason: "Granted via tools/sysadmin.ts",
  });
  if (result.alreadyActive) {
    console.log(
      `${user.email} already holds SYSADMIN ; nothing to do. Run "list" to see the full roster.`,
    );
    return;
  }
  console.log(
    `Granted SYSADMIN to ${user.email} (id=${user.id}). Assignment id : ${result.assignmentId}.`,
  );
}

async function revoke(query: string): Promise<void> {
  const user = await resolveUser(query);
  if (!user) {
    throw new Error(`No user matched "${query}" (tried email then id).`);
  }
  const db = getDb();
  const assignment = await db.roleAssignment.findFirst({
    where: {
      userId: user.id,
      organizationId: null,
      roleId: SYSADMIN_ID,
      revokedAt: null,
    },
    select: { id: true },
  });
  if (!assignment) {
    console.log(`${user.email} does not currently hold SYSADMIN ; nothing to revoke.`);
    return;
  }
  await revokeRole(assignment.id, ACTOR_ID, "Revoked via tools/sysadmin.ts");
  console.log(`Revoked SYSADMIN from ${user.email}.`);
}

async function list(): Promise<void> {
  const db = getDb();
  const rows = await db.roleAssignment.findMany({
    where: {
      revokedAt: null,
      organizationId: null,
      roleId: SYSADMIN_ID,
    },
    include: {
      user: { select: { id: true, email: true, displayName: true } },
    },
    orderBy: { grantedAt: "asc" },
  });
  if (rows.length === 0) {
    console.log("No active SYSADMIN holders.");
    return;
  }
  console.log(`${rows.length} SYSADMIN ${rows.length === 1 ? "holder" : "holders"} :`);
  for (const row of rows) {
    const label = row.user.displayName
      ? `${row.user.displayName} <${row.user.email}>`
      : row.user.email;
    console.log(`  - ${label} (id=${row.user.id}, granted ${row.grantedAt.toISOString()})`);
  }
}

async function main(): Promise<void> {
  const [, , subcommand, target] = process.argv;
  switch (subcommand) {
    case "grant": {
      if (!target) throw new Error("usage : pnpm tsx tools/sysadmin.ts grant <userId | email>");
      await grant(target);
      break;
    }
    case "revoke": {
      if (!target) throw new Error("usage : pnpm tsx tools/sysadmin.ts revoke <userId | email>");
      await revoke(target);
      break;
    }
    case "list": {
      await list();
      break;
    }
    default: {
      console.log("usage :");
      console.log("  pnpm tsx tools/sysadmin.ts grant  <userId | email>");
      console.log("  pnpm tsx tools/sysadmin.ts revoke <userId | email>");
      console.log("  pnpm tsx tools/sysadmin.ts list");
      process.exitCode = 1;
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDb().$disconnect();
  });
