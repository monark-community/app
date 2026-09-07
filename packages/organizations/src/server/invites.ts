import { createHash, randomBytes } from "node:crypto";
import { BRANDING } from "@monark/branding";
import { emit, NotFoundError, ValidationError } from "@monark/common";
import { sendMail } from "@monark/notifications/server";
import { findRoleById } from "@monark/rbac/server";
import type { InviteAcceptedEvent, InviteSentEvent } from "../contracts/events";
import {
  acceptInviteRow,
  createInviteRow,
  deleteInviteRow,
  findInviteByTokenHash,
  findPendingInvitesForEmail,
  findById as findOrgById,
} from "./data";

// 14-day expiry feels right: long enough that a recipient who was on
// vacation can still claim it after they're back, short enough that
// stale invites don't pile up in the org's pending list.
const INVITE_TTL_DAYS = 14;

// 32 raw bytes → 64 hex chars of plaintext token. We never store the
// plaintext (the schema only has `tokenHash`) ; the recipient's email
// link is the only place it lives. Hash is SHA-256 to match every
// other secret-by-token surface in the codebase.
function generateToken(): { plaintext: string; hash: string } {
  const plaintext = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, hash };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type CreateInviteInput = {
  organizationId: string;
  email: string;
  /**
   * Optional pre-fill for the recipient's display name. Used in the
   * invite email greeting and pre-populated on signup acceptance ;
   * empty / nullish skips the pre-fill.
   */
  displayName?: string | null;
  /** FK into the Role table — must be assignable within this org. */
  roleId: string;
  invitedById: string;
  /** Used to build the absolute sign-up URL in the invite email. */
  appUrl: string;
};

type CreateInviteResult = {
  inviteId: string;
  email: string;
  displayName: string | null;
  roleId: string;
  roleKey: string;
  roleName: string;
  expiresAt: Date;
  /** Plaintext token, returned to the caller for the email link only. */
  token: string;
  signUpUrl: string;
};

// Create + email an invite. Locale on the email defaults to the org's
// brand language ; we don't carry a per-recipient preference yet (the
// invitee doesn't have a User row to read `localePreference` from).
export async function createInvite(input: CreateInviteInput): Promise<CreateInviteResult> {
  const org = await findOrgById(input.organizationId);
  if (!org) throw new NotFoundError("Organization", input.organizationId);
  if (org.deletedAt) {
    throw new ValidationError("Cannot invite to a deleted organization.");
  }
  const role = await findRoleById(input.roleId);
  if (!role) throw new NotFoundError("Role", input.roleId);
  // Custom roles must belong to this org. Built-in roles (today : just
  // ADMIN) carry `organizationId: null` and are assignable anywhere.
  if (!role.builtIn && role.organizationId !== input.organizationId) {
    throw new ValidationError(`Role ${role.key} is scoped to a different organization.`);
  }
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new ValidationError("invalid_email");
  }

  const { plaintext, hash } = generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const displayName = input.displayName?.trim() || null;
  const row = await createInviteRow({
    organizationId: input.organizationId,
    email,
    displayName,
    roleId: role.id,
    invitedById: input.invitedById,
    tokenHash: hash,
    expiresAt,
  });

  const signUpUrl = `${input.appUrl.replace(/\/$/, "")}/signup?invite=${plaintext}`;
  // Greeting branches on whether we have a name to address them with ;
  // falls back to a neutral hello so the email doesn't read as
  // half-personalized.
  const greetingHtml = displayName
    ? `<p style="margin:0 0 12px 0;font-size:16px;color:#18181b;">Hi ${displayName},</p>`
    : "";
  const greetingText = displayName ? `Hi ${displayName},\n\n` : "";
  await sendMail({
    to: email,
    subject: `You're invited to ${org.displayName} on ${BRANDING.appName}`,
    text: `${greetingText}${org.displayName} has invited you to join ${BRANDING.appName} as ${role.name}.

Accept the invite by signing up at:
${signUpUrl}

This invite expires on ${expiresAt.toISOString().slice(0, 10)}.`,
    html: `${greetingHtml}<p style="margin:0 0 12px 0;font-size:16px;color:#18181b;"><strong>${org.displayName}</strong> has invited you to join <strong>${BRANDING.appName}</strong> as <strong>${role.name}</strong>.</p>
<p style="margin:0 0 24px 0;color:#3f3f46;">Accept the invite by signing up below. This link expires on ${expiresAt.toISOString().slice(0, 10)}.</p>
<p style="margin:0 0 24px 0;"><a href="${signUpUrl}" style="display:inline-block;padding:12px 22px;background:#18181b;color:#ffffff;font-weight:700;text-decoration:none;border-radius:8px;">Accept invite</a></p>
<p style="margin:0;color:#a1a1aa;font-size:12px;">If you weren't expecting this, you can safely ignore the email.</p>`,
  }).catch(() => {
    // Best-effort ; the row is already persisted so the admin can
    // re-send by recreating the invite. Logging happens inside sendMail.
  });

  const event: InviteSentEvent = {
    type: "organization.invite-sent",
    organizationId: input.organizationId,
    inviteId: row.id,
    email,
    roleId: role.id,
    roleKey: role.key,
    actorId: input.invitedById,
    occurredAt: new Date(),
  };
  await emit(event).catch(() => {});

  return {
    inviteId: row.id,
    email,
    displayName,
    roleId: role.id,
    roleKey: role.key,
    roleName: role.name,
    expiresAt,
    token: plaintext,
    signUpUrl,
  };
}

// Looks up the invite by token hash, validates expiry / not-already-
// accepted, runs the atomic accept (membership + role assignment), and
// emits `organization.invite-accepted`.
export async function acceptInviteByToken(
  token: string,
  userId: string,
): Promise<{ organizationId: string; roleId: string }> {
  const invite = await findInviteByTokenHash(hashToken(token));
  if (!invite) throw new NotFoundError("Invite", "token");
  if (invite.acceptedAt) {
    return { organizationId: invite.organizationId, roleId: invite.roleId };
  }
  if (invite.expiresAt < new Date()) {
    throw new ValidationError("Invite has expired.");
  }
  const result = await acceptInviteRow({ inviteId: invite.id, userId });
  const event: InviteAcceptedEvent = {
    type: "organization.invite-accepted",
    organizationId: result.organizationId,
    inviteId: invite.id,
    userId,
    occurredAt: new Date(),
  };
  await emit(event).catch(() => {});
  return result;
}

// Auto-accept hook : called after sign-in / sign-up, looks up every
// pending invite matching the user's email and applies them. Each row
// is processed independently so a single failure (e.g. expired) doesn't
// block the rest. Returns the count of successful acceptances for the
// caller to surface a "joined N organizations" toast if it wants.
export async function consumePendingInvitesForUser(
  userId: string,
  email: string,
): Promise<{ accepted: number }> {
  const rows = await findPendingInvitesForEmail(email);
  let accepted = 0;
  for (const invite of rows) {
    try {
      await acceptInviteRow({ inviteId: invite.id, userId });
      const event: InviteAcceptedEvent = {
        type: "organization.invite-accepted",
        organizationId: invite.organizationId,
        inviteId: invite.id,
        userId,
        occurredAt: new Date(),
      };
      await emit(event).catch(() => {});
      accepted += 1;
    } catch {
      // Single-row failures (e.g. row vanished mid-loop) shouldn't
      // pull the rest down ; the event log still captures successes.
    }
  }
  return { accepted };
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await deleteInviteRow(inviteId);
}
