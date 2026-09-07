import { registerFlags } from "@monark/feature-flags/server";

// Feature flags owned by the auth module. Registered at api boot via
// `registerAuthFeatureFlags()` ; the flag namespace `auth.*` is owned
// by this module and an extended module that wants its own gates
// should pick a different namespace (its package name is the
// canonical choice).
const AUTH_FLAGS = {
  "trusted-devices": {
    description:
      "Track trusted devices on sign-in (cookie + DB rows). Kill switch for the whole subsystem; when off, no recognition or persistence happens.",
    defaultOn: true,
  },
  "totp-trust-devices": {
    description:
      "Let a previously-TOTP-verified device skip the challenge on subsequent sign-ins. Off ⇒ TOTP is always challenged, even on recognized devices.",
    defaultOn: true,
  },
  oauth: {
    description:
      "Social sign-in through Supabase Auth's OAuth providers. Off ⇒ the provider buttons disappear from /signin and /signup and the callback refuses to provision, so an in-flight round trip can't land an account. Which providers are offered is separately controlled by the api's AUTH_OAUTH_PROVIDERS env.",
    defaultOn: true,
  },
  "totp-required-admin": {
    description: "Enforce TOTP enrollment for admin roles within 7 days of first sign-in.",
    defaultOn: true,
  },
} as const;

export function registerAuthFeatureFlags(): void {
  registerFlags("auth", AUTH_FLAGS);
}
