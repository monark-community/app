import { ValidationError } from "@monark/common";
import type { Paginated, PaginationArgs } from "@monark/common/pagination";
import { cursorFindArgs, resolveLimit, toPage } from "@monark/common/pagination";
import { getDb, type Prisma } from "@monark/db";

// Per-record engagement (votes + comments), gated per-model by
// DataModel.votingEnabled / discussionsEnabled. Kept separate from the
// forms/board plumbing so it can later serve the authed record view too — the
// data layer knows nothing about forms, only records + principals.

// ── Voting ───────────────────────────────────────────────────
// A vote identity is a real principal encoded as a `voterKey` :
// "user:<userId>" or "invite:<dataFormInviteId>". Never anonymous. The
// (dataRecordId, voterKey) unique enforces one vote per identity per record.

export type VoteResult = { voted: boolean; count: number };

/**
 * Toggle the caller's vote on a record : add it if absent, remove it if
 * present. Returns the caller's new state + the record's total. `userId` is
 * stored (nullable FK) for user votes so the vote cascades on account
 * deletion ; invite votes pass it undefined.
 */
export async function toggleVote(
  dataRecordId: string,
  voterKey: string,
  userId?: string | null,
): Promise<VoteResult> {
  const db = getDb();
  const existing = await db.dataRecordVote.findUnique({
    where: { dataRecordId_voterKey: { dataRecordId, voterKey } },
    select: { id: true },
  });
  let voted: boolean;
  if (existing) {
    await db.dataRecordVote.delete({ where: { id: existing.id } });
    voted = false;
  } else {
    try {
      await db.dataRecordVote.create({ data: { dataRecordId, voterKey, userId: userId ?? null } });
      voted = true;
    } catch (e) {
      // Concurrent double-cast raced past the find : the row now exists, so the
      // caller has already voted. Treat as a no-op success.
      if ((e as { code?: string }).code === "P2002") voted = true;
      else throw e;
    }
  }
  const count = await db.dataRecordVote.count({ where: { dataRecordId } });
  return { voted, count };
}

export type VoteState = { count: number; hasVoted: boolean };

/**
 * Batched vote state for a page of records : one `groupBy` count plus one
 * lookup of the caller's own votes (no N+1). `voterKey` omitted (anonymous
 * viewer) yields `hasVoted: false` everywhere.
 */
export async function voteStateFor(
  dataRecordIds: string[],
  voterKey?: string | null,
): Promise<Record<string, VoteState>> {
  const out: Record<string, VoteState> = {};
  for (const id of dataRecordIds) out[id] = { count: 0, hasVoted: false };
  if (dataRecordIds.length === 0) return out;
  const db = getDb();
  const counts = await db.dataRecordVote.groupBy({
    by: ["dataRecordId"],
    where: { dataRecordId: { in: dataRecordIds } },
    _count: { _all: true },
  });
  for (const c of counts) {
    const e = out[c.dataRecordId];
    if (e) e.count = c._count._all;
  }
  if (voterKey) {
    const mine = await db.dataRecordVote.findMany({
      where: { dataRecordId: { in: dataRecordIds }, voterKey },
      select: { dataRecordId: true },
    });
    for (const m of mine) {
      const e = out[m.dataRecordId];
      if (e) e.hasVoted = true;
    }
  }
  return out;
}

// ── Comments ─────────────────────────────────────────────────
// Comments are user-only (authored by a logged-in User) and auto-published.
// `hidden` is admin moderation (kept, not shown publicly) ; `deletedAt` is a
// soft delete (author or admin). Bodies are stored as plain text.

const MAX_COMMENT_LENGTH = 4000;

export type CommentRow = Prisma.DataRecordCommentGetPayload<{
  include: { author: { select: { id: true; displayName: true; avatarUrl: true } } };
}>;

const withAuthor = {
  author: { select: { id: true, displayName: true, avatarUrl: true } },
} satisfies Prisma.DataRecordCommentInclude;

// Reduce arbitrary user input to safe plain text : drop any markup, collapse
// whitespace, trim, and cap length. No HTML is ever stored → no stored XSS.
function toPlainText(input: string): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_COMMENT_LENGTH);
}

/**
 * Chronological (oldest-first) page of a record's comments. Always hides
 * soft-deleted rows ; hides moderated (`hidden`) rows unless `includeHidden`
 * (an admin surface). Keyset over id, mirroring `listDataRecords`.
 */
export async function listRecordComments(
  dataRecordId: string,
  args: PaginationArgs & { includeHidden?: boolean },
): Promise<Paginated<CommentRow>> {
  const db = getDb();
  const limit = resolveLimit(args.limit);
  const where: Prisma.DataRecordCommentWhereInput = {
    dataRecordId,
    deletedAt: null,
    ...(args.includeHidden ? {} : { hidden: false }),
  };
  const [rows, total] = await Promise.all([
    db.dataRecordComment.findMany({
      where,
      include: withAuthor,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...cursorFindArgs(limit, args.cursor),
    }),
    db.dataRecordComment.count({ where }),
  ]);
  return toPage(rows, total, limit);
}

/** Post a comment. Tag-strips the body and rejects an empty result. */
export async function createRecordComment(
  dataRecordId: string,
  authorId: string,
  body: string,
): Promise<CommentRow> {
  const text = toPlainText(body);
  if (!text) throw new ValidationError("A comment can't be empty.");
  return getDb().dataRecordComment.create({
    data: { dataRecordId, authorId, body: text },
    include: withAuthor,
  });
}

export async function getCommentById(commentId: string): Promise<CommentRow | null> {
  return getDb().dataRecordComment.findUnique({ where: { id: commentId }, include: withAuthor });
}

/** Admin moderation : keep the row but hide (or unhide) it from public view. */
export async function setCommentHidden(commentId: string, hidden: boolean): Promise<void> {
  await getDb().dataRecordComment.update({ where: { id: commentId }, data: { hidden } });
}

/** Soft delete (author or admin). Row kept for audit ; excluded from every list. */
export async function softDeleteComment(commentId: string): Promise<void> {
  await getDb().dataRecordComment.update({
    where: { id: commentId },
    data: { deletedAt: new Date() },
  });
}

/**
 * Batched public comment counts (excludes hidden + soft-deleted) for a page of
 * records, for list badges. One `groupBy`, no N+1.
 */
export async function commentCountFor(dataRecordIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const id of dataRecordIds) out[id] = 0;
  if (dataRecordIds.length === 0) return out;
  const counts = await getDb().dataRecordComment.groupBy({
    by: ["dataRecordId"],
    where: { dataRecordId: { in: dataRecordIds }, deletedAt: null, hidden: false },
    _count: { _all: true },
  });
  for (const c of counts) {
    if (c.dataRecordId in out) out[c.dataRecordId] = c._count._all;
  }
  return out;
}
