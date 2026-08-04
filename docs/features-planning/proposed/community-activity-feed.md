# Community & Profile Activity Feeds

## Context

Monark has rich user profiles today, but only for **self-service**. `/account/profile` lets a user edit their `displayName`, `bio`, `avatarUrl`, and `bannerUrl` ; there is no **public** profile page and no social layer at all. A grep of the tree confirms zero `Post` / `Comment` / `Reaction` / `Subscription` / `Follow` models or UI exist.

This feature is the first slice of a subscription-driven feed. The long-term vision is that a user subscribes to many data models (`Project`, `Industry`, `Country`, `Region`) and their Monark feed is tailored to those subscriptions. **For now the only subscribable model is another User.** A public profile becomes a place to introduce yourself, share short thoughts, discuss (comments), and react (a fixed emoji set). Users post only to **their own** feed ; any co-member may comment on and react to anyone's content.

The subscription edge is modeled generically from day one (`targetType` + `targetId`) so that `Project` / `Industry` / `Country` / `Region` targets slot in later with no schema reshape ; only the enum grows.

### Decisions locked

- **Scope : organization-scoped.** You see, subscribe to, and interact with co-members of your active organization only. The deploy defaults to single-tenant (`tenancy.multi-tenant` flag off ⇒ singleton org auto-membership), so in practice this is "everyone on the deploy" today ; the data stays org-scoped so the feature is correct the moment multi-tenant is turned on.
- **Identity : globally-unique `@username` handle** added to `User`. Profiles live at `/u/[username]` ; this sets up `@mentions` later.
- **Subscription : one-way follow** (no approval). A follow is just a subscription edge, which maps cleanly onto the future data-model subscriptions.
- **Posts : text-only** (≤ 500 characters) at MVP. Image posts are a deliberate fast-follow ; Supabase Storage is already wired for avatars / banners.

## Architecture fit

Honors the module tier contract ([extensibility-contract.md](../../technical-documentation/extensibility-contract.md), [CLAUDE.md](../../../CLAUDE.md)) in **two parts** :

- **Part A — a core change to the `users` module** (which owns the `User` model) : add the `username` column, generation on signup, edit UI, and a backfill. An extended module cannot touch `User`, so the handle is a core contribution.
- **Part B — a new extended module `@monark/community`** : owns a `// ── MODULE: community ──` fragment in the core `schema.prisma`, exactly as extended `@monark/projects` already owns its `Project` / `Industry` models. Scaffold with `pnpm gen:module`, register in [modules.manifest.ts](../../../modules.manifest.ts) at tier `extended`, and wire its `register*` helpers into [services/api/src/server.ts](../../../services/api/src/server.ts). It depends only on core modules (`users`, `organizations`, `rbac`, `notifications`, `feature-flags`, `common`, `db`) and never on another extended module.

## Goals

- Any authenticated user has a **public profile** at `/u/[username]` visible to co-members : banner, avatar, display name, bio, follower / following / post counts, and their post history.
- A user can **follow / unfollow** any co-member ; a follow is a generic subscription edge (`targetType = USER`).
- A user can **post** short text to their **own** feed ; posts appear on their profile and in followers' home feeds.
- A user can **comment** on any co-member's post and **react** to posts and comments from a **fixed emoji set** (one active reaction per user per target).
- A **home feed** at `/feed` shows posts from followees + self, reverse-chronological, infinite scroll.
- Authors are **notified** in-app when someone follows them, comments on their post, or reacts to it.
- The whole feature is behind a `community.enabled` feature flag for incremental rollout.

## Non-goals

- **No image / video posts at MVP.** Text only ; images are the first fast-follow (Storage is already available).
- **No threaded replies beyond one reserved level.** A nullable `parentCommentId` is stored for future use ; MVP renders comments flat.
- **No blocking / muting / reporting.** Moderation at MVP is an admin soft-hide only.
- **No private accounts / per-post visibility.** Org membership is the visibility boundary ; every co-member sees every post.
- **No `@mention` autocomplete.** The handle enables it later ; the composer does not parse mentions yet.
- **No non-User subscription targets.** The enum has only `USER` ; `PROJECT` / `INDUSTRY` / `COUNTRY` / `REGION` are future work.
- **No ranking / algorithmic feed.** Strict reverse-chronological.

## User stories

- **As a user**, I claim a handle on `/account/profile`, write my bio, and share the link to my `/u/alice` profile.
- **As a user**, I visit a co-member's profile, click Follow, and their posts start appearing in my `/feed`.
- **As a user**, I post a short text thought to my own feed ; my followers see it.
- **As a user**, I comment on and react (👍 ❤️ 🎉 💡 👏 🤔) to another user's post ; the author gets an in-app notification.
- **As a user**, I open `/feed` and scroll an infinite reverse-chronological list of posts from everyone I follow plus my own.
- **As an admin**, I can hide an inappropriate post or comment (`community.moderate`) without deleting the author's account.
- **As an operator**, I keep the whole feature dark until launch by leaving `community.enabled` off, and flip it on when ready.

## Data model

### Part A : `username` on the existing `User`

Add to the `User` block in [packages/db/prisma/schema.prisma](../../../packages/db/prisma/schema.prisma) :

```prisma
username String? @unique   // 3–30 chars, ^[a-z0-9_]+$, lowercased. Nullable to allow backfill ; effectively-present once backfilled.
```

Plus the community back-relations Prisma requires (named to match Part B's relations : `communitySubscriptions`, `communityPosts`, `communityComments`, `communityPostReactions`, `communityCommentReactions`).

### Part B : new `// ── MODULE: community ──` fragment

```prisma
// ── MODULE: community ─────────────────────────────────────────

enum SubscriptionTargetType {
  USER
  // future : PROJECT, INDUSTRY, COUNTRY, REGION
}

enum ReactionType {
  LIKE          // 👍
  LOVE          // ❤️
  CELEBRATE     // 🎉
  INSIGHTFUL    // 💡
  APPLAUSE      // 👏
  CURIOUS       // 🤔
}

// A generic follow edge. For USER targets, targetId is the followed
// user's id. The enum grows for Project / Industry / Country / Region
// later ; nothing else about this table changes.
model Subscription {
  id             String                 @id @default(cuid())
  subscriberId   String
  subscriber     User                   @relation("CommunitySubscriber", fields: [subscriberId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization           @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  targetType     SubscriptionTargetType @default(USER)
  targetId       String
  createdAt      DateTime               @default(now())

  @@unique([subscriberId, organizationId, targetType, targetId])
  @@index([organizationId, targetType, targetId])   // "who follows target X"
  @@index([subscriberId, organizationId])            // "who I follow"
}

// A post is authored to the author's own feed only. authorId is always
// the acting user ; there is no posting on behalf of others.
model Post {
  id             String        @id @default(cuid())
  authorId       String
  author         User          @relation("CommunityAuthor", fields: [authorId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  body           String                                  // ≤ 500 chars, enforced with zod at the boundary
  hiddenAt       DateTime?                                // moderation soft-hide
  hiddenById     String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  comments       PostComment[]
  reactions      PostReaction[]

  @@index([organizationId, createdAt])   // org timeline scan
  @@index([authorId, createdAt])         // a profile's post history
}

model PostComment {
  id              String            @id @default(cuid())
  postId          String
  post            Post              @relation(fields: [postId], references: [id], onDelete: Cascade)
  authorId        String
  author          User              @relation("CommunityCommentAuthor", fields: [authorId], references: [id], onDelete: Cascade)
  parentCommentId String?                                // reserved for 1-level replies ; MVP renders flat
  body            String
  hiddenAt        DateTime?
  createdAt       DateTime          @default(now())
  reactions       CommentReaction[]

  @@index([postId, createdAt])
}

// One reaction per user per post ; the type is replaceable (upsert on
// the unique key when a user switches emoji).
model PostReaction {
  id        String       @id @default(cuid())
  postId    String
  post      Post         @relation(fields: [postId], references: [id], onDelete: Cascade)
  userId    String
  user      User         @relation("CommunityPostReactor", fields: [userId], references: [id], onDelete: Cascade)
  type      ReactionType
  createdAt DateTime     @default(now())

  @@unique([postId, userId])
  @@index([postId])
}

model CommentReaction {
  id        String       @id @default(cuid())
  commentId String
  comment   PostComment  @relation(fields: [commentId], references: [id], onDelete: Cascade)
  userId    String
  user      User         @relation("CommunityCommentReactor", fields: [userId], references: [id], onDelete: Cascade)
  type      ReactionType
  createdAt DateTime     @default(now())

  @@unique([commentId, userId])
  @@index([commentId])
}
```

Reactions are stored as an **enum, not a raw emoji string** ; that keeps them validated, indexable, and i18n-labelable (the emoji glyph is a UI concern mapped from the enum).

## API surface

A `communityRouter` sub-router in `packages/community/src/server/index.ts` (composed into the app router by `pnpm gen:routers`). Prisma access lives in `server/data.ts`. Every procedure resolves the caller's org with `requireOrg(...)` and scopes all reads / writes to `ctx.activeOrganizationId` ; interactions require the target post / user to belong to the same org, and its author to be a co-member. Every write gates on a registered permission.

```ts
// profile
community.profile.getByUsername({ username })
//   → { user, counts: { followers, following, posts }, isFollowedByMe }

// subscriptions (one-way follow)
community.follow({ targetType: "USER", targetId })          // requires community.subscribe
community.unfollow({ targetType: "USER", targetId })
community.listFollowers({ userId })
community.listFollowing({ userId })

// posts
community.posts.create({ body })                            // requires community.post ; author = ctx.userId always
community.posts.delete({ id })                              // author, or community.moderate
community.posts.getById({ id })
community.posts.listByAuthor({ userId, cursor? })           // infinite ; a profile's history
community.posts.feed({ cursor? })                           // infinite, reverse-chron :
//   Post where organizationId = activeOrg
//     AND authorId IN (followees ∪ self)
//     AND hiddenAt IS NULL
//   ORDER BY createdAt DESC

// comments
community.comments.create({ postId, body, parentCommentId? })   // requires community.comment
community.comments.delete({ id })                               // author, or community.moderate
community.comments.listForPost({ postId, cursor? })

// reactions (fixed emoji set ; one active per user per target)
community.reactions.setPost({ postId, type })              // requires community.react ; upsert on @@unique
community.reactions.unsetPost({ postId })
community.reactions.setComment({ commentId, type })
community.reactions.unsetComment({ commentId })

// moderation
community.moderation.hidePost({ id })                      // requires community.moderate
community.moderation.hideComment({ id })
```

Post and comment payloads carry `reactionCounts` (by type) and `myReaction` inline, so the client renders the reaction bar without a second round-trip. All external input is validated with zod at the boundary (`body` length, `username` shape, enum membership).

### Part A additions to `usersRouter`

```ts
users.updateProfile({ ..., username? })   // 3–30 chars, ^[a-z0-9_]+$ ; typed CONFLICT error on collision
// getByUsername(username) added to packages/users/src/server/read.ts
```

## UI flows

All under `services/web/src/app/(authed)`, gated by `community.enabled`. Every async surface ships a **layout-accurate `Skeleton`** (feed cards, profile header, comment list). Data via `trpc.community.*` with `useInfiniteQuery` / `keepPreviousData` ; mutations invalidate via `trpc.useUtils().community.*`. All strings are i18n en + fr.

### `/u/[username]` — public profile

- Reuses [`UserBanner`](../../../services/web/src/components/user-banner.tsx) for the banner + avatar + name header.
- Bio, follower / following / post counts.
- **Follow / Unfollow** button (hidden on your own profile ; your own profile shows an "Edit profile" link to `/account/profile`).
- The author's post history (`posts.listByAuthor`, infinite).
- A **composer** (text + character counter, ≤ 500) appears **only on your own profile**.

### `/feed` — home feed

- Infinite reverse-chronological list of `posts.feed`.
- A composer pinned at the top posts to your own feed.
- Each post card : author (avatar + handle, links to `/u/[username]`), body, relative time, a **reaction bar** (the six-emoji set, one active per user), and a flat **comment thread** with load-more and an inline comment box.
- Empty state : "Follow people to fill your feed", linking to a way to discover co-members.

### Shared components

`services/web/src/components/community/` : `PostComposer`, `PostCard`, `CommentList`, `ReactionBar`. Presentational ; already-translated labels passed in as props, following the app-local pattern of [components/patterns](../../../services/web/src/components/patterns).

### Navigation

- Add a "Feed" / "Community" entry to the primary nav ([sidebar.tsx](../../../services/web/src/components/sidebar.tsx) / [app-launcher.tsx](../../../services/web/src/components/app-launcher.tsx)), behind `community.enabled`.
- Add "View profile" → `/u/[my-username]` to [user-menu.tsx](../../../services/web/src/components/user-menu.tsx).

### Profile editing (Part A)

Extend [account/profile-section.tsx](<../../../services/web/src/app/(authed)/account/profile-section.tsx>) with a `username` field : inline format + availability validation, saved through the existing `DirtyFormBar` flow next to `displayName` / `bio`.

## Dependencies

- **`users`** — owns `User` + the new `username` ; reused via `read.ts` (`getById`, `getByUsername`) to hydrate authors. Part A is a change to this core module.
- **`organizations`** — org resolution (`requireOrg`) and the **co-membership** check that enforces org-scoping ; membership lookups in `packages/organizations/src/server`.
- **`rbac`** — `community.post` / `.comment` / `.react` / `.subscribe` / `.moderate` gate every write ; `ADMIN` / `SYSADMIN` short-circuit.
- **`notifications`** — in-app notifications to authors (new follower, comment, reaction).
- **`feature-flags`** — `community.enabled` gates nav, routes, and router procedures.
- **`common`** — the event bus + event-type registry.
- **`db`** — the schema fragment + Prisma client.

## Integration points

### Permissions (`registerCommunityPermissions`, category `community`)

`community.post`, `community.comment`, `community.react`, `community.subscribe`, `community.moderate`. Registered at boot ; surface automatically in `/admin/rbac`.

### Events emitted (`contracts/events.ts` + `registerCommunityEventTypes`)

```ts
export const COMMUNITY_POST_CREATED = "community.post-created";
export const COMMUNITY_COMMENT_CREATED = "community.comment-created";
export const COMMUNITY_REACTION_ADDED = "community.reaction-added";
export const COMMUNITY_SUBSCRIBED = "community.subscribed";
```

Regenerate the union with `pnpm gen:events`. The webhooks wildcard subscriber picks these up with no extra code ; register the event-type descriptions so they show in the webhooks subscription picker.

### Notification kinds (`registerCommunityNotificationKinds`, en + fr, category `ACTIVITY`, `IN_APP`)

`community.new-follower`, `community.post-commented`, `community.post-reacted`. Prefer event-bus subscribers under `packages/community/src/server/subscribers` over inline `notify()`. **Never notify the actor about their own action** (self-comment, self-reaction on your own post).

### Feature flag (`registerCommunityFlags`)

`community.enabled` (`defaultOn: false`). Checked at the router boundary and in the web nav / routes.

## Edge cases

- **Handle collision on claim.** `updateProfile` returns a typed `CONFLICT` ; the form surfaces "handle taken" inline. Uniqueness enforced by the DB `@unique` as the source of truth (check-then-write races resolve on the constraint).
- **Existing users with no handle.** Backfill script (mirror [tools/single-org-user-backfill.ts](../../../tools/single-org-user-backfill.ts)) assigns a generated unique slug ; new signups get an auto-generated handle they can change.
- **Following yourself.** Rejected at the boundary ; a self-follow would pollute the feed's `∪ self` term.
- **Target user leaves / is removed from the org.** Org-scoped feed queries stop surfacing their posts to you ; the `Subscription` row can remain (harmless) or be swept. Deleting the user cascades all their community rows via `onDelete: Cascade`.
- **Cross-org interaction attempt.** A post / user id from another org fails the co-membership guard with `FORBIDDEN` ; never leak existence.
- **Reaction switch.** Changing emoji upserts on `@@unique([postId, userId])` ; there is never more than one reaction row per user per target.
- **Deleted post with comments / reactions.** `onDelete: Cascade` removes children ; a soft-hide (`hiddenAt`) keeps them for audit but filters them from all reads except moderation.
- **Feature flag off mid-session.** Routes and procedures check the flag on each request ; the feature disappears cleanly with no broken links (nav entry also gated).

## Risks

- **Handle namespace is global but the graph is org-scoped.** Intentional : handles are global-unique (clean URLs, future mentions) while visibility is per-org. Document so it isn't mistaken for a leak.
- **Feed fan-out cost.** The `authorId IN (followees)` query is index-served by `Post(organizationId, createdAt)` + `Subscription(subscriberId, organizationId)` ; fine at expected scale. If follow counts grow large, revisit with a materialized timeline (out of scope now).
- **Moderation surface is thin.** Admin soft-hide only ; no user-side reporting / blocking. Acceptable for an org-scoped (co-worker) audience at MVP ; revisit before any cross-org exposure.
- **Notification volume.** A popular post could fan out many reaction notifications ; batch / rate-limit (or coalesce "N people reacted") if it becomes noisy.

## Implementation phasing

Split across PRs under one module, not across phases :

1. **Part A — `username`** : schema + migration, generation on signup, `updateProfile` + `getByUsername`, backfill script, profile-section field. Self-contained core change ; ships independently.
2. **Community scaffold** : `pnpm gen:module community`, manifest entry, schema fragment + migration, `register*` wiring in `server.ts`, flag off. `pnpm gen && pnpm typecheck` green.
3. **Follow + profiles** : subscriptions router, `/u/[username]` page with Follow button, own-profile composer, `posts.create` / `listByAuthor`.
4. **Home feed + comments + reactions** : `/feed`, comment + reaction routers and components, events + notifications wired.
5. **Docs + polish** : module `README.md`, user-guide + technical-documentation pages, CHANGELOG entry, flip `community.enabled` when ready.

## Verification

- **Pre-PR gate** : `pnpm gen && pnpm typecheck && pnpm lint && pnpm test && pnpm check:tiers`.
- **Unit / integration** : data-access, permission gating, and **org-scope isolation** (a cross-org id must be rejected) in `packages/community/tests`.
- **e2e** (`services/web/tests`) : the follow → post → comment → react → feed loop, plus "feature disappears when `community.enabled` is off".
- **Manual (single-tenant dev)** : seed two users in the singleton org. As A, claim a handle at `/account/profile` ; visit B's `/u/[username]` and follow ; as B, post text ; confirm it lands in A's `/feed` ; A comments and reacts ; confirm B receives in-app notifications ; confirm a user in a **different** org sees neither B's profile nor posts.

## Out of scope

- Image / video posts, link previews, rich text.
- Threaded comment replies beyond the reserved `parentCommentId`.
- Blocking, muting, user-side reporting.
- `@mention` autocomplete and mention notifications.
- Non-User subscription targets (`Project` / `Industry` / `Country` / `Region`).
- Algorithmic ranking, trending, discovery / search of people to follow (beyond a basic empty-state prompt).
- Cross-org / public-internet visibility of profiles.
