import { emit, logger } from "@monark/common"
import { isEnabled } from "@monark/feature-flags/server"
import type { OrganizationCreatedEvent } from "../contracts/events"
import {
  countActiveOrganizations,
  createOrganizationRow,
  findOnlyActiveOrganization,
} from "./data"

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export type BootstrapStatus = {
  /**
   * `single` when the `tenancy.multi-tenant` flag is OFF (default) ;
   * `multi` when ON. The mode determines whether the system needs at
   * least one org before app routes unlock.
   */
  mode: "single" | "multi"
  /**
   * True iff the system is ready to serve requests. In single-tenant
   * mode this requires exactly one non-deleted Organization row ; in
   * multi-tenant the system is always considered bootstrapped (orgs
   * are created on demand by the user-facing flows).
   */
  bootstrapped: boolean
  /** Count of non-deleted organizations. Surfaces to the /setup page. */
  organizationCount: number
  /**
   * Id of the singleton organization in single-tenant mode. Set only
   * when `mode === "single"` and exactly one non-deleted org exists ;
   * null otherwise (multi-tenant, pre-bootstrap, or somehow >1 org).
   * Used by the admin sidebar to link the "Organization" tab straight
   * at the singleton's edit page so single-tenant operators don't
   * stop on the redirect-only `/admin/organizations` URL.
   */
  singletonOrganizationId: string | null
  /**
   * Display name + logo URL of the singleton organization. Same gate
   * as `singletonOrganizationId` (single-tenant + exactly one org).
   * Used by the public app chrome (AppBar logo + pre-auth screens) so
   * the singleton org's branding follows the user before sign-in too.
   * Multi-tenant pre-auth has no org context — falls back to the
   * starter-template brand. Both fields are null when the gate
   * doesn't fire.
   */
  singletonDisplayName: string | null
  singletonLogoUrl: string | null
}

export async function getBootstrapStatus(): Promise<BootstrapStatus> {
  const multi = await isEnabled("tenancy.multi-tenant")
  const mode: BootstrapStatus["mode"] = multi ? "multi" : "single"
  const organizationCount = await countActiveOrganizations()
  if (multi) {
    return {
      mode,
      bootstrapped: true,
      organizationCount,
      singletonOrganizationId: null,
      singletonDisplayName: null,
      singletonLogoUrl: null,
    }
  }
  // Single-tenant : look up the row only when count is exactly 1, so
  // the misconfigured ">1 org under single-tenant" case (operator
  // flipped to single after running multi) doesn't pin the sidebar to
  // an arbitrary row.
  let singletonOrganizationId: string | null = null
  let singletonDisplayName: string | null = null
  let singletonLogoUrl: string | null = null
  if (organizationCount === 1) {
    const singleton = await findOnlyActiveOrganization()
    singletonOrganizationId = singleton?.id ?? null
    singletonDisplayName = singleton?.displayName ?? null
    singletonLogoUrl = singleton?.logoUrl ?? null
  }
  return {
    mode,
    bootstrapped: organizationCount >= 1,
    organizationCount,
    singletonOrganizationId,
    singletonDisplayName,
    singletonLogoUrl,
  }
}

// Convenience for single-tenant code paths that want "the org" without
// a picker. Returns null in multi-tenant mode (caller should branch
// on tenancy.multi-tenant beforehand) or when single-tenant isn't yet
// bootstrapped.
export async function getSingletonOrganization() {
  return findOnlyActiveOrganization()
}

export type InitialOrgInput = {
  slug: string
  displayName: string
  primaryColor?: string | null
  logoUrl?: string | null
  /** Used as the actor on the emitted `organization.created` event. */
  actorId: string
}

export type EnsureBootstrapResult =
  | { ok: true; created: boolean; organizationId: string }
  | {
      ok: false
      reason:
        | "already-multi-tenant"
        | "already-bootstrapped"
        | "env-not-set"
        | "invalid-slug"
        | "invalid-color"
        | "internal"
      detail?: string
    }

// Reusable single-tenant bootstrap from explicit env-style inputs.
// Same semantics as the API server's boot-time hook ; pulled into the
// organizations package so the same code path is reachable both at
// module-load (server.ts) and through the tRPC `bootstrapFromEnv`
// mutation the /setup page calls on each stuck-poll. Self-healing :
// if the boot-time hook silently failed (timing race, swallowed
// import error, container restarted before env was set), the /setup
// page's polling drives recovery without an operator restart.
//
// Validation runs in this function (slug shape + color shape) so a
// typo in the env var lands as a structured `reason` the /setup page
// can surface, instead of throwing a Prisma constraint deep in the
// stack.
export async function ensureSingletonOrganizationFromInput(input: {
  slug?: string | null
  displayName?: string | null
  primaryColor?: string | null
  logoUrl?: string | null
  actorId: string
}): Promise<EnsureBootstrapResult> {
  try {
    const status = await getBootstrapStatus()
    if (status.mode !== "single") {
      return { ok: false, reason: "already-multi-tenant" }
    }
    if (status.bootstrapped) {
      const existing = await findOnlyActiveOrganization()
      return existing
        ? { ok: true, created: false, organizationId: existing.id }
        : { ok: false, reason: "already-bootstrapped" }
    }
    const slug = (input.slug ?? "").trim()
    const displayName = (input.displayName ?? "").trim()
    if (!slug || !displayName) {
      return { ok: false, reason: "env-not-set" }
    }
    if (!SLUG_RE.test(slug) || slug.length < 2 || slug.length > 60) {
      return { ok: false, reason: "invalid-slug", detail: slug }
    }
    const color = input.primaryColor?.trim() || null
    if (color && !HEX_RE.test(color)) {
      return { ok: false, reason: "invalid-color", detail: color }
    }
    const result = await bootstrapSingletonOrganization({
      slug,
      displayName,
      primaryColor: color,
      logoUrl: input.logoUrl ?? null,
      actorId: input.actorId,
    })
    return {
      ok: true,
      created: result.created,
      organizationId: result.organizationId,
    }
  } catch (error) {
    logger.error(
      { err: error },
      "ensureSingletonOrganizationFromInput failed",
    )
    return {
      ok: false,
      reason: "internal",
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

// One-shot bootstrap helper. Creates the singleton organization in
// single-tenant mode if it doesn't exist yet, emits
// `organization.created`, and returns the row. Idempotent : a second
// call after the org lands is a no-op (existing row returned, no
// event re-emitted).
export async function bootstrapSingletonOrganization(
  input: InitialOrgInput,
): Promise<{ created: boolean; organizationId: string }> {
  const before = await countActiveOrganizations()
  if (before >= 1) {
    const existing = await findOnlyActiveOrganization()
    if (existing) {
      return { created: false, organizationId: existing.id }
    }
    // Multiple orgs already (operator flipped to single-tenant after
    // running multi-tenant) — bail rather than silently picking one.
    throw new Error(
      "Cannot bootstrap singleton : multiple organizations already exist.",
    )
  }
  const row = await createOrganizationRow({
    slug: input.slug,
    displayName: input.displayName,
    primaryColor: input.primaryColor ?? null,
    logoUrl: input.logoUrl ?? null,
  })
  const event: OrganizationCreatedEvent = {
    type: "organization.created",
    organizationId: row.id,
    actorId: input.actorId,
    occurredAt: new Date(),
  }
  await emit(event).catch((error: unknown) => {
    logger.warn(
      { err: error, organizationId: row.id },
      "organization.created emit failed during bootstrap",
    )
  })
  return { created: true, organizationId: row.id }
}
