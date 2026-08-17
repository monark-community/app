- 2026-05-07: Auto-membership for single-tenant deploys + webhook fallback. The morning's three-rule routing fix landed correctly but exposed a deeper gap : `OrganizationMembership` was only ever populated by the invite-acceptance path, so direct sign-ups in single-tenant deploys had no membership row. The webhook subscriber's user-tied membership rule needed something to look up ; users had nothing.
  - **`ensureSingletonMembership(userId)`** ([packages/organizations/src/server/auto-membership.ts](monark/app/packages/organizations/src/server/auto-membership.ts)) idempotently upserts an `OrganizationMembership` row for the singleton org when : (a) the multi-tenant flag is OFF, (b) exactly one non-deleted org exists, and (c) the user has no active membership. Emits `organization.member-joined` on a fresh upsert so the webhook outbox sees the join with the same shape as an invite-driven one. Members an admin explicitly removed (`leftAt` set) are NOT auto-rejoined — sign-in won't undo a removal silently.
  - **`registerOrganizationsSubscribers()`** wires the helper to `user.signed-up` + `user.signed-in` on the bus. Registered at api boot before `registerWebhookSubscribers()` so the derived `member-joined` event reaches the webhook outbox in the same emit pass. Idempotent ; calling twice is a no-op.
  - **Webhook subscriber single-tenant fallback** ([packages/webhooks/src/server/subscribers.ts](monark/app/packages/webhooks/src/server/subscribers.ts)) — when the membership lookup returns empty for a user-tied event AND there's exactly one non-deleted org, the subscriber treats the singleton as the implicit org and routes to its endpoints. Covers (a) brand-new accounts whose first sign-in fires before the auto-membership upsert lands, and (b) deploys that pre-date this CHANGELOG entry where every existing user has no membership row. New `findOnlySingletonOrgId()` helper in [packages/webhooks/src/server/data.ts](monark/app/packages/webhooks/src/server/data.ts) does the lookup with a `take: 2` so it returns null for multi-org deploys without scanning the full table.
  - **`@monark/organizations` now depends on `@monark/auth`** for the type imports of `UserSignedUpEvent` / `UserSignedInEvent` (used by the `on<E>(...)` generics so the handler narrows the event payload). Direction is one-way ; auth has never depended on organizations, no cycle.
  - **Effect.** Sign in as any user once and the `OrganizationMembership` table populates. Webhooks subscribed to `user.signed-in` / `user.signed-out` (or any user-tied event) deliver to org-scoped endpoints from the next emit forward. The fallback covers the very first sign-in before the upsert commits.
  - **Backfill (optional).** Existing single-tenant deploys with users predating this change can either let the auto-membership subscriber backfill on each user's next sign-in, or run a one-shot script :
    ```ts
    import { getDb } from "@monark/db";
    import { findOnlyActiveOrganization } from "@monark/organizations/server";
    const db = getDb();
    const org = await findOnlyActiveOrganization();
    if (org) {
      await db.organizationMembership.createMany({
        data: (await db.user.findMany({ select: { id: true } })).map((u) => ({
          userId: u.id,
          organizationId: org.id,
        })),
        skipDuplicates: true,
      });
    }
    ```
  - `pnpm typecheck` stays clean across all 15 packages.
