# Social Posting Automation

## Context

The exec brief lists "automated marketing content : runtime-produced posts and assets generated from preconfigured dynamic layouts" as a priority. The CRM-style app being built in this repo already emits domain events for the lifecycle moments worth posting about (a university gets confirmed, a new project starts, a milestone hits). Hand those events into a small posting pipeline that hydrates pre-approved templates with the event's payload, lets Claude tailor wording to each network, and pushes to the configured social accounts ; team gets an approval queue for the borderline cases, evergreen content cycles on a schedule.

This is feature-flagged and modular. It depends on auth/users (operator identity for the approval queue), the existing events bus, and the notifications module's transport infrastructure (we already have an SMTP client + a registry pattern that maps to this almost 1:1). Nothing in the core app should _require_ this module to be present ; if the org isn't on social, the events fire and no subscribers care.

## Goals

- **Connect** : OAuth flows for each supported network, encrypted refresh-token storage per `SocialAccount` row, multi-account-per-network supported (e.g. main page + dev relations page).
- **Templates** : declarative templates with variables, network-specific overrides (length, hashtags, mention syntax), preview before save.
- **Triggers** : event-driven (any `emit`-ed domain event can map to a template) AND schedule-driven (cron-like recurrence for evergreen posts, e.g. weekly digest).
- **Content generation** : Claude hydrates the template with the event payload + adapts tone / length per network. Operators see the rendered draft, not the raw template, before approval.
- **Approval queue** : configurable per template — auto-publish for low-risk triggers, hold-for-review for high-stakes ones, manual-only for VIP announcements.
- **Reliability** : retry queue for transient failures (rate limits, transient 5xx), surface terminal failures to operators, rotate refresh tokens before expiry.
- **Audit** : every post tracks template + event payload + approver + posted-at + per-network post id, so a "where did this Twitter post come from" trace is a single query.
- **i18n** : posts respect the org's brand-language settings ; per-template locale variants supported.

## Non-goals

- **Not a social-media management suite.** No inbox for replies, no comment-mod tools, no DM management. Posting only.
- **No image / video generation.** Templates ship with static media references ; if the event has a thumbnail, we use it. Generative imagery is an out-of-scope future module.
- **No platform-specific feature parity.** We post text + optional media. Platform-native features (Twitter polls, LinkedIn carousels, Instagram stories) are explicit future work, not "if it's there we use it."
- **No automated engagement.** No likes / follows / replies on behalf of the brand. Only outbound posts.
- **No A/B testing harness at MVP.** The data model permits it (multiple drafts per event) but the UI for split testing lands later.
- **Not a CMS.** Templates aren't a blog editor ; they're typed Liquid-like strings with variable slots.

## User stories

- **As an admin**, I connect our Twitter and LinkedIn accounts via OAuth on `/admin/social-accounts`, name each account ("Main", "Dev relations"), and see token expiry + last-success times.
- **As an admin**, I create a template "New university confirmed" with a variable for the university's name, attach it to the `university.confirmed` event, and pick which connected accounts it posts to.
- **As an admin**, I configure the template to _queue for review_ — when the trigger fires, I see the rendered draft on `/admin/social-queue` with the event payload, and I click Approve or Reject.
- **As an admin**, when an approved post fails to publish (rate-limited, token expired), I get an in-app notification + an email so I can reconnect the account.
- **As a developer of the platform**, when I add a new domain event, the social-automation module discovers it through the events registry and offers it as a trigger option in the template editor without code changes here.
- **As an admin**, I schedule a weekly "active projects digest" post on Mondays at 9am ; the schedule lane fires the same render+approve+publish pipeline as event-driven posts.
- **As an admin**, I see a per-template post history with engagement counts (impressions, clicks) pulled from each network's analytics API.

## Data model

```prisma
// ── MODULE: social-automation ─────────────────────────────────

enum SocialNetwork {
  TWITTER       // X
  LINKEDIN      // page-tier ; personal profiles not supported at MVP
  FACEBOOK      // page-tier
  INSTAGRAM     // business account (linked Facebook page) ; image required
  THREADS       // Meta threads API
  BLUESKY       // free, AT-protocol
  MASTODON      // federated, instance-specific
}

model SocialAccount {
  id             String          @id @default(cuid())
  organizationId String
  organization   Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  network        SocialNetwork
  // Operator-assigned label : "Main", "Dev relations", etc. Used in
  // the queue UI so a post going to two LinkedIn pages reads
  // unambiguously.
  label          String
  // Network-side identifier (Twitter user id, LinkedIn org urn, etc.).
  // Read-only after connect ; rotates only on reconnect.
  externalId     String
  // OAuth secrets at rest. Same AES-256-GCM pattern as TotpSecret :
  // ciphertext + iv + auth tag, key from SOCIAL_TOKEN_ENCRYPTION_KEY.
  accessTokenCipher  Bytes
  accessTokenIv      Bytes
  accessTokenTag     Bytes
  refreshTokenCipher Bytes?
  refreshTokenIv     Bytes?
  refreshTokenTag    Bytes?
  tokenExpiresAt     DateTime?
  // Granted scopes ; useful for "this account can't post images
  // because the OAuth scope was reduced" diagnostics.
  scopes         String[]
  connectedAt    DateTime        @default(now())
  connectedById  String
  connectedBy    User            @relation(fields: [connectedById], references: [id])
  disconnectedAt DateTime?
  // Last successful refresh / post ; surfaces "this account hasn't
  // worked in 14 days" warnings on the accounts list.
  lastUsedAt     DateTime?
  lastErrorAt    DateTime?
  lastErrorReason String?
  templates      SocialTemplateAccount[]
  posts          SocialPost[]

  @@unique([organizationId, network, externalId])
  @@index([organizationId])
  @@index([disconnectedAt])
}

model SocialTemplate {
  id             String          @id @default(cuid())
  organizationId String
  organization   Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  // Internal label for the template list. Not posted ; just operator-
  // facing.
  name           String
  description    String?
  // The raw template string with `{{ variable }}` slots. Stored once ;
  // network-specific transforms (length, hashtags, mention syntax)
  // happen at render time via the LLM tone-tailoring pass + a small
  // deterministic post-processor.
  body           String
  // Optional media references (URLs into the avatars bucket today,
  // a future media bucket later). Each network decides how to render.
  mediaUrls      String[]
  // Trigger : either an event key like `"organization.created"` or a
  // schedule cron. Exactly one is non-null.
  eventKey       String?
  cronExpression String?
  cronTimezone   String?         // e.g. "America/Toronto"
  // Posting policy :
  //   - AUTO_PUBLISH : render, post, no human gate. For low-risk
  //     evergreens.
  //   - REVIEW       : render, queue for approval, post on approve.
  //   - MANUAL       : never auto-fires. Operator picks the template
  //     from /admin/social-queue and triggers it manually.
  policy         SocialPostPolicy @default(REVIEW)
  // Locale variants. When the trigger fires, we render in every
  // locale listed and post to the matching network/account whose
  // `localePreference` (configured per SocialAccount) matches. Empty
  // = render in the org's brand-default locale only.
  locales        String[]
  active         Boolean         @default(true)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  createdById    String
  createdBy      User            @relation(fields: [createdById], references: [id])
  accounts       SocialTemplateAccount[]
  posts          SocialPost[]

  @@index([organizationId, eventKey])
  @@index([organizationId, active])
}

enum SocialPostPolicy {
  AUTO_PUBLISH
  REVIEW
  MANUAL
}

// Junction : a template fans out to N accounts. The same template
// can target Twitter + LinkedIn + Mastodon at once.
model SocialTemplateAccount {
  templateId String
  template   SocialTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  accountId  String
  account    SocialAccount  @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@id([templateId, accountId])
}

model SocialPost {
  id             String          @id @default(cuid())
  organizationId String
  organization   Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  templateId     String?
  template       SocialTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)
  accountId      String
  account        SocialAccount   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  // The fully-rendered text Claude produced for this network. Stored
  // pre-approval so the operator sees what's about to ship and the
  // audit log captures the actual content (not the template alone).
  renderedBody   String
  renderedMedia  String[]
  // Rendered alternates from the same trigger. Operator can swap in
  // /admin/social-queue. Always stores the picked one in `renderedBody`.
  alternates     Json?
  // The triggering event payload, frozen at render time. Lets us
  // re-render after a template edit without re-firing the event ;
  // also surfaces on the queue card so the operator sees what data
  // backed the post.
  triggerPayload Json?
  triggerEventKey String?
  status         SocialPostStatus @default(DRAFT)
  scheduledFor   DateTime?
  postedAt       DateTime?
  // Network-side post id, returned by the API on success. Used for
  // analytics fetches and for the "view on Twitter" link.
  externalPostId String?
  externalUrl    String?
  // Approval audit : who approved or rejected, when, optional note.
  reviewedById   String?
  reviewedBy     User?           @relation("SocialPostReviewer", fields: [reviewedById], references: [id])
  reviewedAt     DateTime?
  reviewNote     String?
  // Failure trail. `failureReason` is the last error message ; we
  // retry transient failures (rate limit, network) and only mark
  // FAILED after the retry budget is exhausted.
  attemptCount   Int             @default(0)
  failedAt       DateTime?
  failureReason  String?
  // Engagement counters refreshed by the analytics worker. Approximate
  // because each network exposes different metrics ; we normalise to
  // impressions + clicks + reactions.
  impressions    Int?
  clicks         Int?
  reactions      Int?
  metricsRefreshedAt DateTime?
  createdAt      DateTime        @default(now())

  @@index([organizationId, status])
  @@index([accountId, postedAt])
  @@index([templateId])
  @@index([scheduledFor, status])
}

enum SocialPostStatus {
  DRAFT       // rendered, awaiting review
  APPROVED    // queued for publish
  SCHEDULED   // approved + scheduled for future
  POSTED      // shipped
  FAILED      // exhausted retry budget
  REJECTED    // operator rejected, kept for audit
  CANCELLED   // template/account deleted before posting
}
```

## Architecture

```
┌─────────────────┐       ┌──────────────────────┐       ┌────────────────┐
│ Domain event    │ emit  │ social-automation    │       │ social-network │
│ bus (existing)  ├──────►│  /server/subscriber  ├──────►│  integrations  │
│                 │       │                      │       │                │
│ "university.    │       │ - resolve templates  │       │ TwitterClient  │
│  confirmed"     │       │ - render via Claude  │       │ LinkedInClient │
└─────────────────┘       │ - upsert SocialPost  │       │ MastodonClient │
        ▲                 │ - branch on policy   │       │ ...            │
        │                 └──────────┬───────────┘       └────────┬───────┘
   schedule cron                     │                            │
   (BullMQ-style)                    ▼                            ▼
                            ┌──────────────────┐          ┌───────────────┐
                            │ /admin/social-*  │ approve  │ retry queue   │
                            │   - accounts     ├─────────►│ (BullMQ or    │
                            │   - templates    │          │  pg-boss)     │
                            │   - queue        │          └───────────────┘
                            │   - history      │
                            └──────────────────┘
```

**Module boundaries**

- `packages/social-automation/` (new module, extended-tier)
  - `contracts/` : `SocialPostPolicy` enum, event types (`social-post.created`, `.posted`, `.failed`), `TemplateRenderInput`.
  - `server/data.ts` : Prisma access for accounts / templates / posts.
  - `server/integrations/` : one file per network (`twitter.ts`, `linkedin.ts`, etc.) each exporting `connect`, `refreshToken`, `post`, `fetchMetrics` against a shared `SocialIntegration` interface.
  - `server/render.ts` : Claude integration. Wraps the Anthropic SDK ; takes a template + payload + target network, returns rendered body + alternates.
  - `server/subscriber.ts` : registers listeners on the events bus ; for each event, looks up matching `SocialTemplate` rows where `eventKey === eventType` and `active === true`, fans out one `SocialPost` per (template, account) pair, branches on `policy`.
  - `server/scheduler.ts` : cron runner. Wakes hourly, finds templates with `cronExpression` whose next-fire time has passed, fires them like event-driven ones.
  - `server/index.ts` : tRPC router exposing `socialAutomation.*`.
  - `client/index.ts` : hooks (`useSocialQueue` etc.).

- `services/web/src/app/(authed)/admin/social/` (new admin surface)
  - `accounts/` : list + connect/disconnect.
  - `templates/` : list + create + edit.
  - `queue/` : drafts awaiting review + scheduled.
  - `history/` : posted, with engagement metrics.

**Dependencies in this codebase**

- `@monark/feature-flags` : `social-automation` flag gates the whole module.
- `@monark/rbac` : new permissions `social:manage-accounts`, `social:manage-templates`, `social:approve-posts`. Built-in `ADMIN` carries all three implicitly.
- `@monark/notifications` : alerts on terminal failures (`social.post-failed` notification kind) + reconnect-required prompts.
- `@monark/auth` : reuse the AES-256-GCM helpers from `totp.ts` for OAuth token encryption.
- `@monark/common/events` : the existing emit/listen infrastructure carries event triggers ; no new bus needed.

## Per-network integration notes

Each network's auth + posting model is different enough to deserve its own integration file. The shared interface is small ; the divergence is in the OAuth flow + payload shape.

| Network     | OAuth flow              | Token lifetime          | Content shape                                | Notable limits                                         |
| ----------- | ----------------------- | ----------------------- | -------------------------------------------- | ------------------------------------------------------ |
| Twitter / X | OAuth 2.0 + PKCE        | 2h access / 6mo refresh | text 280, optional media (image, video, gif) | tier-based, paid above Basic                           |
| LinkedIn    | OAuth 2.0               | 60d access / 1y refresh | text 3000, optional image / article          | requires app review for w_organization_social          |
| Facebook    | OAuth 2.0 (page tokens) | 60d (page token)        | text + media                                 | Page Access Token, requires Meta business verification |
| Instagram   | OAuth via Meta          | 60d                     | image required, caption 2200 chars           | image / video must be on a public URL we control       |
| Threads     | OAuth via Meta          | 60d                     | text 500                                     | Meta Threads API, in beta as of 2026                   |
| Bluesky     | App password (atproto)  | no expiry until rotated | text 300, optional images                    | rate-limited but no payment tier                       |
| Mastodon    | OAuth per instance      | no expiry               | text 500 (default, instance-config'd)        | instance-specific URL ; multi-instance support needed  |

**MVP scope** : Twitter, LinkedIn, Mastodon, Bluesky. Twitter for reach, LinkedIn for B2B / partner-facing, Mastodon + Bluesky as low-friction "always works" coverage that proves the architecture without paid API tiers blocking dev. Facebook / Instagram / Threads land in a follow-up since they all share the Meta Business setup and are better tackled together.

**Token refresh strategy** : a daily cron walks `SocialAccount` rows where `tokenExpiresAt < now + 7d`, refreshes them ahead of expiry, alerts on refresh failure. Avoids the "post fails because token died at 4am" class of failure.

## Claude integration

The LLM does three jobs at render time. Everything else is deterministic code.

1. **Template hydration with tone tailoring**. Input : the template body, the event payload, the target network, the locale. Output : a rendered string sized for the network, in the right tone (LinkedIn formal, Twitter casual, Mastodon community-friendly), with hashtags appropriate to the network's culture.
2. **Generate alternates**. The same call returns 2–3 variants so an operator approving from the queue can pick the one that reads best. Stored in `SocialPost.alternates`.
3. **Length compression**. When a network has a hard char limit (Twitter's 280) and the hydrated template would overflow, Claude rewrites tighter. Deterministic truncation is a fallback only.

**Why Claude instead of pure templates** : the alternative is per-network template variants for every trigger. That's a maintenance multiplier ; one trigger × four networks × two locales = eight strings to keep in sync. With Claude, the operator authors _one_ template per trigger (or per locale), and the network adaptation is a runtime concern.

**Prompt caching** : the per-org "voice guide" (a free-text field on `SocialTemplate` or org-level) goes in a cache breakpoint so subsequent renders against the same template hit the warm cache. Cuts cost meaningfully on high-volume schedules. Use Claude Sonnet for renders ; templates aren't long enough to justify Opus.

**Guardrails** : a small post-processor strips common LLM artefacts (leading "Sure!", trailing "Let me know if you want adjustments"), verifies length under the network limit, refuses to post if Claude returned a refusal pattern. Failures fall back to the raw template with deterministic variable substitution and surface a yellow flag in the queue UI ("AI render failed, raw template shown").

**Out-of-scope LLM uses** : we do _not_ have Claude generate posts from scratch (no "post about something cool today"). Every post comes from a human-authored template ; Claude's job is shaping not authoring. This keeps brand voice predictable and avoids hallucination risk.

## tRPC API surface

```
socialAutomation.adminListAccounts({ organizationId })
socialAutomation.adminConnectAccount({ network })          // returns OAuth URL
socialAutomation.adminCompleteConnection({ code, state })  // OAuth callback handler
socialAutomation.adminDisconnectAccount({ accountId })

socialAutomation.adminListTemplates({ organizationId, eventKey?, active? })
socialAutomation.adminCreateTemplate({ ... })
socialAutomation.adminUpdateTemplate({ id, ... })
socialAutomation.adminDeleteTemplate({ id })
socialAutomation.adminPreviewTemplate({ id, samplePayload })  // dry-run render

socialAutomation.adminListQueue({ organizationId, status? })
socialAutomation.adminApprovePost({ postId, alternateIndex?, note? })
socialAutomation.adminRejectPost({ postId, note? })
socialAutomation.adminRetryPost({ postId })

socialAutomation.adminListHistory({ organizationId, accountId?, templateId?, range? })
socialAutomation.adminFetchMetrics({ postId })             // sync metrics from network

// Discovery surface used by the template editor's trigger picker.
socialAutomation.adminListEventKeys()
```

All `admin*` procedures require the appropriate `social:*` permission. `adminListEventKeys` walks the events registry and returns every event type the platform emits — automatic discovery means a new domain event is immediately available as a trigger without touching this module.

## UI surfaces

- **`/admin/social/accounts`** : table of connected accounts with network logo, label, last-used time, token expiry chip (green / yellow / red). "Connect new" button per network kicks off OAuth.
- **`/admin/social/templates`** : list of templates filtered by trigger ; "New template" opens an editor with :
  - Trigger picker (event key from `adminListEventKeys` _or_ a cron expression with timezone).
  - Body editor with variable autocompletion (variables come from the event payload's TypeScript type).
  - Account multi-select.
  - Policy radio (auto / review / manual).
  - Locales multi-select.
  - Live preview against a sample payload (pulls from a saved seed or the most recent real event).
- **`/admin/social/queue`** : cards for `DRAFT` and `SCHEDULED` posts. Each card shows :
  - Account + network.
  - Rendered body (clickable to swap to an alternate).
  - Source event payload as a collapsed JSON block.
  - Approve / Reject buttons. Approve → mark posted (or scheduled). Reject → mark REJECTED with optional note.
- **`/admin/social/history`** : posted timeline with per-post engagement metrics, link to the network-side post, "this came from template X triggered by event Y" provenance link.
- **Optional badge on the AppBar** : a count of pending review-queue posts so operators don't have to remember to check.

i18n : every visible string in en + fr per the project's standard ; locale variants on templates respect this too.

## Approval / safety guardrails

- **Per-template policy** is the primary lever. `AUTO_PUBLISH` for evergreens / counter milestones ; `REVIEW` for anything carrying a partner / customer name ; `MANUAL` for sensitive announcements (M&A, executive changes, incident comms).
- **Brand voice document** stored on the org and prepended to every Claude render. Operators edit it as the brand evolves.
- **Hold for first publish** : when a template is created, the first three posts always queue for review regardless of policy. Catches misrendered variables / awful tone before they ship.
- **Kill switch** : a feature flag `social.posting-paused` that any admin can flip ; flipped, every approved post stays in `APPROVED` instead of moving to `SCHEDULED`. Recovers from "we just learned about something we shouldn't post about" scenarios.
- **Per-account rate limits** : track posts-per-hour-per-account ; refuse to schedule a fourth post in an hour for the same account by default. Operator can override.
- **Privacy whitelist** : event payloads carrying user-identifiable data must declare which fields are safe to surface in social posts ; the renderer strips everything else before passing to Claude. Default-deny on personal data.
- **Disable on org delete / suspend** : when an org's `deletedAt` flips, every social subscription pauses ; tokens are not auto-revoked (the operator may want to restore).

## Scheduling + retry logic

- **Schedule lane** : a per-minute cron walks templates with `cronExpression` and fires the renderer for any whose next-occurrence has passed. Idempotent : last-fired-at tracked on the template ; missed firings (server down) coalesce to a single post unless the cron is rapid.
- **Retry queue** : posts entering the publish step go through a job queue (recommend `pg-boss` for the same-Postgres simplicity, or `BullMQ` if a Redis is already in play). Retry policy :
  - Transient (rate-limited, 5xx, network) → exponential backoff, max 5 attempts over 4 hours.
  - Token expired → run refresh, retry once. If refresh fails, mark `FAILED` and notify operator.
  - Terminal (rejected by network for content reasons) → mark `FAILED` immediately, no retry, surface the network's reason text.
- **Failure notifications** : each terminal failure emits a `social.post-failed` notification ; the notifications module's existing fan-out delivers it to operators with the `social:approve-posts` permission. Account-level failures (token revoked) emit `social.account-broken` once per account, not per post, to avoid alert fatigue.

## Analytics + feedback loop

- **Metrics fetch** : a daily cron walks posts from the last 30 days, calls each network's analytics endpoint, updates `impressions / clicks / reactions / metricsRefreshedAt`. Older posts age out of the refresh set so we're not paying for analytics on year-old content.
- **Per-template aggregates** displayed on the template list : average impressions, click-through rate, top-performing variant. Operators use this to prune low-value templates and double down on what works.
- **No engagement-driven auto-tuning at MVP.** The metrics inform humans. Auto-A/B / auto-template-selection is on the future-work list.

## Phasing

**Phase A : foundation, no posting yet.**

- Module scaffold, schema, encryption helpers, `SocialAccount` CRUD UI.
- OAuth wiring for Twitter + Mastodon (no-cost, fastest to validate).
- Token refresh cron.
- "Test post" button on accounts page that posts a hardcoded "hello world" to verify the integration end-to-end.

**Phase B : event-driven posting, manual templates, no LLM yet.**

- Templates with deterministic `{{ variable }}` substitution.
- Subscriber wiring on the events bus.
- Queue UI for `REVIEW` policy.
- Manual `AUTO_PUBLISH` for low-risk patterns.
- LinkedIn + Bluesky integrations land here.

**Phase C : Claude integration.**

- Render pipeline calls Claude with template + payload + network + voice guide.
- Alternates surfaced in the queue.
- Length / tone tailoring.
- Brand voice doc surface.

**Phase D : schedule lane.**

- Cron expressions on templates.
- Scheduler runner.
- "Posting paused" kill switch.

**Phase E : analytics + history.**

- Metrics fetch worker.
- History page with per-post and per-template aggregates.
- Engagement-aware sorting on the template list.

**Phase F : Meta family.**

- Facebook + Instagram + Threads integrations together (they share business verification).
- Image / video handling for Instagram.

## Out of scope

- **Rich media generation** : no AI-generated images, no video composition. We post media URLs that already exist in the avatars bucket or external CDNs.
- **Social inbox** : no replies / DMs / comment moderation. Brand engagement happens elsewhere ; this module is outbound only.
- **Influencer / paid amplification** : no boosting, no ad-API integrations. Organic posts only.
- **Cross-platform reposting** : we don't pull a Twitter post and rebroadcast to LinkedIn ; both come from the same template fan-out at render time.
- **Multi-account routing per template at language tier finer than locale** : if "Main" is English-only and "QC" is French-only, the locale variant on the template carries the routing. We don't add a second routing axis.
- **End-user posting on behalf of users** : this is brand-only ; no individual employees post through it. If we ever want that, it's a separate "personal social tools" module.

## Open questions

- **Where do we store the org's brand voice doc** ? On `Organization` as a `brandVoice: String?` column (simple, one-per-org) or as a separate `BrandVoiceVersion` table (auditable, reversible) ? Lean toward the column at MVP, table when versioning starts to matter.
- **Multi-org support on a single deploy** : the schema supports it (every row is org-scoped). UI nav assumes single-tenant in `/admin/*` today ; lift the org picker if and when the platform serves multiple orgs.
- **Image hosting for Instagram** : Instagram requires a public URL. Do we serve from the avatars Storage bucket or stand up a dedicated `social-media` bucket with shorter cache-control ? Lean toward a separate bucket once Instagram lands ; the cache-control profile is genuinely different.
- **Compliance review on any partner-mentioning post** : do we want a separate "legal review" step layered on top of the operator approval ? Probably overkill for MVP, revisit if we hit a real compliance ask.
