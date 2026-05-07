-- Make `RoleAssignment.grantedById` nullable so system-driven grants
-- (the `tools/sysadmin.ts` CLI bootstrapping the first SYSADMIN before
-- any operator exists) can record "no granter" instead of pointing at
-- a fake user id. UI grants still carry a non-null actor — the tRPC
-- `adminAssignRole` procedure passes the caller's id via the existing
-- `requireAdmin(ctx.userId)` gate.
--
-- The existing FK was `ON DELETE NO ACTION` (Prisma default) ; we
-- replace it with `ON DELETE SET NULL` so deleting a granter user
-- nulls the column on their historical grants instead of blocking
-- the deletion. Existing data is unaffected — every current row has a
-- valid grantedById, so the constraint shift is transparent.

ALTER TABLE "RoleAssignment"
  ALTER COLUMN "grantedById" DROP NOT NULL;

ALTER TABLE "RoleAssignment"
  DROP CONSTRAINT "RoleAssignment_grantedById_fkey";

ALTER TABLE "RoleAssignment"
  ADD CONSTRAINT "RoleAssignment_grantedById_fkey"
  FOREIGN KEY ("grantedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
