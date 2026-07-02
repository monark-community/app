import { randomUUID } from "node:crypto";
import { emit, logger } from "@monark/common";
import { getDb } from "@monark/db";
import type { UserDeletedEvent } from "@monark/users/contracts";
import { getSupabaseAdmin } from "./supabase-admin";

const DELETION_GRACE_DAYS = 14;
const ANONYMIZED_NAME = "Deleted User";

/**
 * Pure helper exposed for the unit suite. The format is load-bearing:
 * `processExpiredDeletions` filters out rows whose email already contains
 * `@monark.invalid` to make hard-delete idempotent, so changing the domain
 * here without updating the filter would re-anonymize already-deleted rows.
 */
export function buildAnonymizedEmail(): string {
  return `deleted-${randomUUID()}@monark.invalid`;
}

// Anonymizes one user row + removes the Supabase auth row + emits
// `user.deleted`. Idempotent on the email field (re-running won't undo a
// prior anonymization). Callers are responsible for ensuring the user is
// past the grace window; `processExpiredDeletions` does the bulk version.
export async function hardDeleteUser(userId: string): Promise<void> {
  const db = getDb();
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const previousEmail = user.email;
  const anonymizedEmail = buildAnonymizedEmail();

  await db.user.update({
    where: { id: userId },
    data: {
      email: anonymizedEmail,
      displayName: ANONYMIZED_NAME,
      avatarUrl: null,
    },
  });

  // Best-effort Supabase delete; if it fails we still want our own row to
  // be anonymized so PII clears even when upstream is flaky.
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    logger.error(
      { err: error, userId },
      "supabase admin deleteUser failed during hard-delete; row anonymized but auth.users still has the entry",
    );
  }

  const event: UserDeletedEvent = {
    type: "user.deleted",
    userId,
    previousEmail,
    occurredAt: new Date(),
  };
  await emit(event);
}

// Iterates every user past the grace window and hard-deletes each. Intended
// to be called from a daily cron once one is wired; the function itself is
// safe to call any time. Returns counts so the caller can log + alert.
export async function processExpiredDeletions(): Promise<{
  attempted: number;
  succeeded: number;
  failed: number;
}> {
  const db = getDb();
  const cutoff = new Date(Date.now() - DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const candidates = await db.user.findMany({
    where: {
      deletedAt: { lte: cutoff, not: null },
      // Don't re-anonymize a row that's already been processed.
      NOT: { email: { contains: "@monark.invalid" } },
    },
    select: { id: true },
  });
  let succeeded = 0;
  let failed = 0;
  for (const { id } of candidates) {
    try {
      await hardDeleteUser(id);
      succeeded += 1;
    } catch (error) {
      failed += 1;
      logger.error({ err: error, userId: id }, "hardDeleteUser failed");
    }
  }
  return { attempted: candidates.length, succeeded, failed };
}
