-- Optional display-color on roles + display-name pre-fill on invites.
--
-- `Role.color` powers the UI's role swatches / chip backgrounds.
-- `Invite.displayName` lets an inviter pre-populate the recipient's
-- account name (used in the email greeting and as the signup-time
-- displayName default).

ALTER TABLE "Role"   ADD COLUMN "color" TEXT;
ALTER TABLE "Invite" ADD COLUMN "displayName" TEXT;
