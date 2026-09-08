import { isEnabled } from "@monark/feature-flags/server";
import { getById, getUserMetadataValue, setUserMetadataValue } from "@monark/users/server";
import { isTotpActive } from "./totp";

/**
 * The post-verification "want to turn on two-factor?" nudge.
 *
 * Why it lives here rather than in the signup flow : the honest moment
 * to ask is *after* the user has proved they own the address, because
 * that's when losing the account actually costs them something and when
 * recovery codes have somewhere to be delivered. Email confirmation is
 * that moment, and it's also when the user first lands on a real
 * authenticated page.
 *
 * Dismissal is persisted through the user-metadata sidecar rather than a
 * schema column : it's one boolean-ish per user with nothing to filter,
 * sort or join on, which is exactly what the sidecar is for (see
 * CLAUDE.md § "Data that doesn't fit core").
 */
const METADATA_MODULE = "auth";
const METADATA_KEY = "totp-onboarding-dismissed";

export type TotpOnboardingStatus = {
  /** True when the prompt should render on the next authenticated page. */
  shouldPrompt: boolean;
};

/**
 * Four conditions, all of which have to hold:
 *
 * 1. The `auth.totp-onboarding-prompt` flag is on for this user. It's a
 *    real switch, not decoration: turning the prompt on for an existing
 *    deployment shows a modal to every not-yet-enrolled user, so an
 *    operator gets to decide when that happens.
 * 2. The email is verified. Asking before that would put a security
 *    upsell in front of someone who hasn't finished signing up, and the
 *    account isn't reachable for recovery yet anyway.
 * 3. TOTP isn't already active — nothing to prompt for.
 * 4. The user hasn't already said no. One dismissal is permanent ;
 *    /account/security keeps the enrollment path available forever, and
 *    a nudge that re-appears is a nag.
 */
export async function getTotpOnboardingStatus(userId: string): Promise<TotpOnboardingStatus> {
  const flagOn = await isEnabled("auth.totp-onboarding-prompt", { userId });
  if (!flagOn) return { shouldPrompt: false };

  const user = await getById(userId);
  if (!user || !user.emailVerifiedAt) return { shouldPrompt: false };

  if (await isTotpActive(userId)) return { shouldPrompt: false };

  const dismissed = await getUserMetadataValue(userId, METADATA_MODULE, METADATA_KEY);
  if (dismissed !== undefined) return { shouldPrompt: false };

  return { shouldPrompt: true };
}

/**
 * Records "not now" so the prompt doesn't come back. Stores a timestamp
 * rather than `true` so a future change of policy (re-ask after N
 * months, say) has the data it would need without a migration.
 */
export async function dismissTotpOnboarding(userId: string): Promise<void> {
  await setUserMetadataValue({
    userId,
    module: METADATA_MODULE,
    key: METADATA_KEY,
    value: { dismissedAt: new Date().toISOString() },
  });
}
