import { registerNotificationKind } from "@monark/notifications/server";

let registered = false;

// Notifies a user when they earn an achievement. In-app by default ; email is
// available but opt-in (a badge is celebratory, not account-safety).
export function registerAchievementsNotificationKinds(): void {
  if (registered) return;
  registered = true;

  registerNotificationKind(
    "achievements.awarded",
    {
      category: "ACTIVITY",
      channels: ["IN_APP", "EMAIL"],
      defaultEnabled: { IN_APP: true, EMAIL: false },
      requiredEmail: false,
      template: "achievements/awarded",
    },
    {
      en: {
        subject: "Achievement unlocked: {{ achievementName }}",
        html: '<p>You earned <strong>{{ achievementName }}</strong> 🏆 (+{{ points }} points).</p><p><a href="/achievements">View your achievements</a></p>',
        text: "You earned {{ achievementName }} (+{{ points }} points). View your achievements: /achievements",
        inapp: {
          subject: "Achievement unlocked: {{ achievementName }}",
          body: "+{{ points }} points",
          link: "/achievements",
        },
      },
      fr: {
        subject: "Succès débloqué : {{ achievementName }}",
        html: '<p>Vous avez obtenu <strong>{{ achievementName }}</strong> 🏆 (+{{ points }} points).</p><p><a href="/achievements">Voir vos succès</a></p>',
        text: "Vous avez obtenu {{ achievementName }} (+{{ points }} points). Voir vos succès : /achievements",
        inapp: {
          subject: "Succès débloqué : {{ achievementName }}",
          body: "+{{ points }} points",
          link: "/achievements",
        },
      },
    },
  );
}
