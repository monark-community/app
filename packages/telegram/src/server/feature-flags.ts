import { registerFlags } from "@monark/feature-flags/server";

// Ships dark : the module registers its nodes + events + webhook, but the
// `/telegram` connect surface and (by convention) new Telegram automations gate
// on this until an org opts in.
const TELEGRAM_FLAGS = {
  enabled: {
    description:
      "Enable the Telegram integration (connect a bot, Telegram trigger events + nodes).",
    defaultOn: false,
  },
} as const;

export function registerTelegramFeatureFlags(): void {
  registerFlags("telegram", TELEGRAM_FLAGS);
}
