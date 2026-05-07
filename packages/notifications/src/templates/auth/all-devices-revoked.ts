import type { KindMessages } from "../types"

const messages: KindMessages = {
  en: {
    subject: "Every session on your {{ appName }} account was ended",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">Every session was ended</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">{{ count }} signed-in device(s) on your {{ appName }} account were revoked at {{ occurredAtFormatted }}. Every browser and device you were signed in on is now signed out.</p>
      <p style="margin:0 0 24px 0;color:#3f3f46;">If you did this from your account settings, no further action is needed. If you did not, change your password immediately and re-enable two-factor authentication if it was turned off.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ signInLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#18181b;text-decoration:none;border-radius:8px;">Sign back in</a>
        </td></tr>
      </table>`,
    text: `{{ count }} signed-in device(s) on your {{ appName }} account were revoked at {{ occurredAtFormatted }}.

Every browser and device you were signed in on is now signed out.

If you did this from your account settings, no further action is needed. If you did not, change your password immediately and re-enable two-factor authentication if it was turned off.

Sign back in: {{ signInLink }}`,
    inapp: {
      subject: "Every session on your account was ended",
      body: "{{ count }} device(s) signed out. If this wasn't you, change your password right now.",
      link: "/account/security",
    },
  },
  fr: {
    subject: "Toutes les sessions de votre compte {{ appName }} ont été terminées",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">Toutes les sessions ont été terminées</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">{{ count }} appareil(s) connecté(s) à votre compte {{ appName }} ont été révoqués le {{ occurredAtFormatted }}. Tous les navigateurs et appareils sur lesquels vous étiez connecté sont maintenant déconnectés.</p>
      <p style="margin:0 0 24px 0;color:#3f3f46;">Si vous l'avez fait depuis vos paramètres de compte, aucune action n'est requise. Sinon, changez votre mot de passe immédiatement et réactivez l'authentification à deux facteurs si elle a été désactivée.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ signInLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#18181b;text-decoration:none;border-radius:8px;">Se reconnecter</a>
        </td></tr>
      </table>`,
    text: `{{ count }} appareil(s) connecté(s) à votre compte {{ appName }} ont été révoqués le {{ occurredAtFormatted }}.

Tous les navigateurs et appareils sur lesquels vous étiez connecté sont maintenant déconnectés.

Si vous l'avez fait depuis vos paramètres de compte, aucune action n'est requise. Sinon, changez votre mot de passe immédiatement et réactivez l'authentification à deux facteurs si elle a été désactivée.

Se reconnecter : {{ signInLink }}`,
    inapp: {
      subject: "Toutes les sessions de votre compte ont été terminées",
      body: "{{ count }} appareil(s) déconnecté(s). Si ce n'était pas vous, changez votre mot de passe immédiatement.",
      link: "/account/security",
    },
  },
}

export default messages
