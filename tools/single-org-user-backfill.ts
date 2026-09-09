/**
 * One-shot backfill : create an `OrganizationMembership` row for
 * every existing `User` against the singleton org. Use after the
 * 2026-05-07 auto-membership change if you don't want to wait for
 * each user's next sign-in to seed their membership.
 *
 * Run from the repo root :
 *
 *   pnpm tsx --env-file=services/api/.env tools/single-org-user-backfill.ts
 *
 * Idempotent : `createMany({ skipDuplicates: true })` no-ops on rows
 * that already exist. Safe to re-run.
 *
 * Imports @monark/db only (a root workspace dep) — the org lookup is
 * inlined as a direct Prisma query so this script doesn't need
 * @monark/organizations as a root dep too.
 */

import { getDb } from "@monark/db";

const db = getDb();

const activeOrgs = await db.organization.findMany({
  where: { deletedAt: null },
  select: { id: true, slug: true },
  take: 2,
});

if (activeOrgs.length !== 1) {
  console.error(
    `backfill: expected exactly 1 active organization, found ${activeOrgs.length}. ` +
      `The app serves exactly one organization ; more than one means an ` +
      `explicit per-user → org mapping is needed first.`,
  );
  process.exit(1);
}

const org = activeOrgs[0]!;

const users = await db.user.findMany({ select: { id: true } });
const result = await db.organizationMembership.createMany({
  data: users.map((u) => ({ userId: u.id, organizationId: org.id })),
  skipDuplicates: true,
});

console.log(
  `backfill: ${users.length} user(s) processed, ${result.count} new membership row(s) created in org "${org.slug}" (${org.id}).`,
);
process.exit(0);
