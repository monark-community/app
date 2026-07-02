/**
 * Provisions the test accounts the gated e2e specs sign in as.
 *
 *   - `e2e-user@monark.test`  — regular user (no role)
 *   - `e2e-admin@monark.test` — built-in `ADMIN`, scoped to the
 *     singleton organization
 *
 * The script is idempotent : re-running on a healthy install is a
 * no-op (auth user already exists → look it up ; Prisma row already
 * present → upsert ; role assignment already active → reuse).
 *
 * Why a tools script and not a database seed file : Supabase auth
 * users live in `auth.users`, not in our Prisma schema, so a SQL
 * seed can't create them. The Supabase admin API can. We also need
 * the auth UUID to land on `User.id` in Prisma so the e2e specs
 * sign in and our Prisma joins line up.
 *
 * Usage :
 *   pnpm tsx --env-file=services/api/.env tools/seed-e2e-users.ts
 *
 * In CI the env vars come from the workflow file directly ; the
 * `--env-file` flag is for local invocation against the
 * `pnpm dev`-style stack.
 *
 * Required env :
 *   - SUPABASE_URL              — e.g. http://127.0.0.1:54321
 *   - SUPABASE_SECRET_KEY       — the service-role key
 *   - DATABASE_URL / DIRECT_URL — Prisma points here for the User row
 *   - INITIAL_ORG_SLUG          — slug of the singleton org (defaults to "monark")
 *   - INITIAL_ORG_NAME          — display name (defaults to "Monark")
 *
 *   - E2E_USER_EMAIL            — defaults to e2e-user@monark.test
 *   - E2E_USER_PASSWORD         — required, no default for safety
 *   - E2E_ADMIN_EMAIL           — defaults to e2e-admin@monark.test
 *   - E2E_ADMIN_PASSWORD        — required
 */

import { getSupabaseAdmin } from "@monark/auth/server";
import { getDb } from "@monark/db";
import { ADMIN_ROLE_KEY, assignRole, findRoleById } from "@monark/rbac/server";
import { bootstrapSingletonOrganization } from "@monark/organizations/server";

// Local alias for the supabase admin client surface ; we don't pull
// the type from `@supabase/supabase-js` directly because the package
// isn't a workspace dep of `tools/`.
type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

// Built-in role row id ; same constant baked into the migration that
// seeds the platform-tier ADMIN row. Granting against the cuid avoids
// a per-org role lookup.
const ADMIN_BUILTIN_ID = "role_admin_builtin";

type SeedSpec = {
  label: string;
  email: string;
  password: string;
  displayName: string;
  /** When set, grant the built-in ADMIN role at this org's id. */
  adminAtOrgId: string | null;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `seed-e2e-users : missing required env var ${name}. See the file header for the full list.`,
    );
  }
  return value;
}

/**
 * Idempotent : if the auth user exists, returns its id. If it
 * doesn't, creates with `email_confirm: true` so the e2e flows
 * sign in without a verification step.
 */
async function upsertAuthUser(input: {
  client: SupabaseAdminClient;
  email: string;
  password: string;
}): Promise<string> {
  const create = await input.client.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (!create.error && create.data.user) {
    return create.data.user.id;
  }
  // Either "user already exists" or another error. Look up the row
  // explicitly ; Supabase returns a 422 with `code: "email_exists"`
  // (or similar) on duplicate, which we treat as "find then return".
  const list = await input.client.auth.admin.listUsers({ perPage: 1000 });
  if (list.error) {
    throw new Error(
      `seed-e2e-users : auth.admin.createUser failed (${create.error?.message ?? "unknown"}) and listUsers fallback failed (${list.error.message}).`,
    );
  }
  const existing = list.data.users.find(
    (u) => u.email?.toLowerCase() === input.email.toLowerCase(),
  );
  if (!existing) {
    throw new Error(
      `seed-e2e-users : auth.admin.createUser failed (${create.error?.message ?? "unknown"}) and no existing auth user matched ${input.email}.`,
    );
  }
  // Make sure the password matches what we want for this run ; resets
  // are cheap and keep the seed deterministic across reruns where
  // someone may have rotated the seed password.
  const update = await input.client.auth.admin.updateUserById(existing.id, {
    password: input.password,
    email_confirm: true,
  });
  if (update.error) {
    throw new Error(
      `seed-e2e-users : updating existing auth user ${input.email} failed : ${update.error.message}`,
    );
  }
  return existing.id;
}

async function upsertPrismaUser(input: {
  authUserId: string;
  email: string;
  displayName: string;
}): Promise<void> {
  const db = getDb();
  await db.user.upsert({
    where: { id: input.authUserId },
    create: {
      id: input.authUserId,
      email: input.email.toLowerCase(),
      emailVerifiedAt: new Date(),
      displayName: input.displayName,
    },
    update: {
      // Keep email + verification status fresh so a reseed of an
      // existing row doesn't drift from the auth row.
      email: input.email.toLowerCase(),
      emailVerifiedAt: new Date(),
      displayName: input.displayName,
    },
  });
}

async function ensureAdminGrant(input: { userId: string; organizationId: string }): Promise<void> {
  const role = await findRoleById(ADMIN_BUILTIN_ID);
  if (!role || !role.builtIn || role.key !== ADMIN_ROLE_KEY) {
    throw new Error(
      `seed-e2e-users : built-in ADMIN role row missing (id=${ADMIN_BUILTIN_ID}). Apply migrations first.`,
    );
  }
  const result = await assignRole({
    userId: input.userId,
    roleId: ADMIN_BUILTIN_ID,
    organizationId: input.organizationId,
    grantedById: null,
    reason: "Granted via tools/seed-e2e-users.ts for the e2e admin specs.",
  });
  if (result.alreadyActive) {
    console.log(
      `  ↳ ADMIN already active on ${input.userId} @ org ${input.organizationId} ; nothing to do.`,
    );
  } else {
    console.log(
      `  ↳ Granted ADMIN to ${input.userId} @ org ${input.organizationId} (assignment ${result.assignmentId}).`,
    );
  }
}

async function seedOne(spec: SeedSpec): Promise<void> {
  console.log(`Seeding ${spec.label} (${spec.email})…`);
  const client = getSupabaseAdmin();
  const authUserId = await upsertAuthUser({
    client,
    email: spec.email,
    password: spec.password,
  });
  await upsertPrismaUser({
    authUserId,
    email: spec.email,
    displayName: spec.displayName,
  });
  if (spec.adminAtOrgId) {
    await ensureAdminGrant({
      userId: authUserId,
      organizationId: spec.adminAtOrgId,
    });
  }
  console.log(`  ↳ user id ${authUserId}.`);
}

async function ensureSingletonOrg(): Promise<string> {
  const slug = process.env.INITIAL_ORG_SLUG ?? "monark";
  const displayName = process.env.INITIAL_ORG_NAME ?? "Monark";
  const result = await bootstrapSingletonOrganization({
    slug,
    displayName,
    actorId: "system:seed-e2e-users",
  });
  if (result.created) {
    console.log(`Bootstrapped singleton org ${slug} (id ${result.organizationId}).`);
  } else {
    console.log(`Singleton org ${slug} already exists (id ${result.organizationId}).`);
  }
  return result.organizationId;
}

async function main(): Promise<void> {
  // Validate env up front so we fail fast, before any side effects.
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SECRET_KEY");
  requireEnv("DATABASE_URL");

  const userPassword = requireEnv("E2E_USER_PASSWORD");
  const adminPassword = requireEnv("E2E_ADMIN_PASSWORD");
  const userEmail = process.env.E2E_USER_EMAIL ?? "e2e-user@monark.test";
  const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@monark.test";

  const orgId = await ensureSingletonOrg();

  await seedOne({
    label: "regular test user",
    email: userEmail,
    password: userPassword,
    displayName: "E2E Test User",
    adminAtOrgId: null,
  });
  await seedOne({
    label: "admin test user",
    email: adminEmail,
    password: adminPassword,
    displayName: "E2E Admin User",
    adminAtOrgId: orgId,
  });

  console.log("seed-e2e-users : done.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exit(1);
  })
  .finally(async () => {
    // Closes the Prisma client so the script exits promptly. Without
    // this the process hangs for a few seconds on the open pool.
    await getDb().$disconnect();
  });
