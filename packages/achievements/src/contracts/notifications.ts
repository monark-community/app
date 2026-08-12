// Declaration-merge the achievements notification payload into the
// notifications registry, so `notify("achievements.awarded", …)` is typed at
// the call site. Side-effect import (no runtime exports) ; activated from
// server/index.ts + the worker. NOT re-exported from contracts/index.ts, so the
// client bundle never pulls the notifications types.

import "@monark/notifications/contracts";

declare module "@monark/notifications/contracts" {
  interface NotificationDataRegistry {
    "achievements.awarded": {
      achievementId: string;
      achievementName: string;
      points: number;
    };
  }
}
