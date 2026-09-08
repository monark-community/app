import { emit, logger } from "@monark/common";
import type { OrganizationCreatedEvent } from "../contracts/events";
import {
  countActiveOrganizations,
  createOrganizationRow,
  findOnlyActiveOrganization,
} from "./data";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export type BootstrapStatus = {
  /**
   * True iff the system is ready to serve requests : exactly one
   * non-deleted Organization row exists. Every app route gates on this
   * and sends the operator to `/setup` until it flips.
   */
  bootstrapped: boolean;
  /** Count of non-deleted organizations. Surfaces to the /setup page. */
  organizationCount: number;
  /**
   * Id of the singleton organization. Null before bootstrap, or in the
   * misconfigured >1-org case. Used by the admin sidebar to link the
   * "Organization" tab straight at the singleton's edit page so
   * operators don't stop on the redirect-only `/admin/organizations`
   * URL.
   */
  singletonOrganizationId: string | null;
  /**
   * Display name + logo URL + primary color of the singleton org.
   * Same gate as `singletonOrganizationId`. Used by the public app
   * chrome (AppBar logo + pre-auth screens) AND by the root layout's
   * CSS-variable injection so the whole app (primary buttons, focus
   * rings, sidebar accents, charts, gradients) follows the operator's
   * chosen brand color. All three are null before bootstrap.
   */
  singletonDisplayName: string | null;
  singletonLogoUrl: string | null;
  singletonPrimaryColor: string | null;
};

export async function getBootstrapStatus(): Promise<BootstrapStatus> {
  const organizationCount = await countActiveOrganizations();
  // Look the row up only when the count is exactly 1, so a database
  // that somehow holds more than one org doesn't pin the chrome to an
  // arbitrary row ; the operator sees the unbootstrapped state and can
  // fix the data instead of getting a silently wrong brand.
  let singletonOrganizationId: string | null = null;
  let singletonDisplayName: string | null = null;
  let singletonLogoUrl: string | null = null;
  let singletonPrimaryColor: string | null = null;
  if (organizationCount === 1) {
    const singleton = await findOnlyActiveOrganization();
    singletonOrganizationId = singleton?.id ?? null;
    singletonDisplayName = singleton?.displayName ?? null;
    singletonLogoUrl = singleton?.logoUrl ?? null;
    // Defensive : only pass through a value that looks like the hex
    // format the rest of the chrome expects ; a corrupt DB row can't
    // poison the root layout's `<html style="…">` and bleed into the
    // CSS of every signed-in or anon user.
    const raw = singleton?.primaryColor;
    if (typeof raw === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) {
      singletonPrimaryColor = raw;
    }
  }
  return {
    bootstrapped: organizationCount >= 1,
    organizationCount,
    singletonOrganizationId,
    singletonDisplayName,
    singletonLogoUrl,
    singletonPrimaryColor,
  };
}

// Convenience for code paths that want "the org" without a picker.
// Null until the deployment is bootstrapped.
export async function getSingletonOrganization() {
  return findOnlyActiveOrganization();
}

export type InitialOrgInput = {
  slug: string;
  displayName: string;
  primaryColor?: string | null;
  logoUrl?: string | null;
  /** Used as the actor on the emitted `organization.created` event. */
  actorId: string;
};

export type EnsureBootstrapResult =
  | { ok: true; created: boolean; organizationId: string }
  | {
      ok: false;
      reason:
        | "already-bootstrapped"
        | "env-not-set"
        | "invalid-slug"
        | "invalid-color"
        | "internal";
      detail?: string;
    };

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
  slug?: string | null;
  displayName?: string | null;
  primaryColor?: string | null;
  logoUrl?: string | null;
  actorId: string;
}): Promise<EnsureBootstrapResult> {
  try {
    const status = await getBootstrapStatus();
    if (status.bootstrapped) {
      const existing = await findOnlyActiveOrganization();
      return existing
        ? { ok: true, created: false, organizationId: existing.id }
        : { ok: false, reason: "already-bootstrapped" };
    }
    const slug = (input.slug ?? "").trim();
    const displayName = (input.displayName ?? "").trim();
    if (!slug || !displayName) {
      return { ok: false, reason: "env-not-set" };
    }
    if (!SLUG_RE.test(slug) || slug.length < 2 || slug.length > 60) {
      return { ok: false, reason: "invalid-slug", detail: slug };
    }
    const color = input.primaryColor?.trim() || null;
    if (color && !HEX_RE.test(color)) {
      return { ok: false, reason: "invalid-color", detail: color };
    }
    const result = await bootstrapSingletonOrganization({
      slug,
      displayName,
      primaryColor: color,
      logoUrl: input.logoUrl ?? null,
      actorId: input.actorId,
    });
    return {
      ok: true,
      created: result.created,
      organizationId: result.organizationId,
    };
  } catch (error) {
    logger.error({ err: error }, "ensureSingletonOrganizationFromInput failed");
    return {
      ok: false,
      reason: "internal",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

// One-shot bootstrap helper. Creates the singleton organization if it
// doesn't exist yet, emits
// `organization.created`, and returns the row. Idempotent : a second
// call after the org lands is a no-op (existing row returned, no
// event re-emitted).
export async function bootstrapSingletonOrganization(
  input: InitialOrgInput,
): Promise<{ created: boolean; organizationId: string }> {
  const before = await countActiveOrganizations();
  if (before >= 1) {
    const existing = await findOnlyActiveOrganization();
    if (existing) {
      return { created: false, organizationId: existing.id };
    }
    // Multiple orgs already : the app serves exactly one, so bail
    // rather than silently picking a row.
    throw new Error("Cannot bootstrap singleton : multiple organizations already exist.");
  }
  const row = await createOrganizationRow({
    slug: input.slug,
    displayName: input.displayName,
    primaryColor: input.primaryColor ?? null,
    logoUrl: input.logoUrl ?? null,
  });
  const event: OrganizationCreatedEvent = {
    type: "organization.created",
    organizationId: row.id,
    actorId: input.actorId,
    occurredAt: new Date(),
  };
  await emit(event).catch((error: unknown) => {
    logger.warn(
      { err: error, organizationId: row.id },
      "organization.created emit failed during bootstrap",
    );
  });
  return { created: true, organizationId: row.id };
}
