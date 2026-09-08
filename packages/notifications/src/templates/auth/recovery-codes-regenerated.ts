import type { KindMessages } from "../types";

const messages: KindMessages = {
  en: {
    subject: "Your {{ appName }} recovery codes were replaced",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">Your recovery codes were replaced</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">A fresh set of {{ count }} two-factor recovery codes was generated for your {{ appName }} account at {{ occurredAtFormatted }}. Your previous codes no longer work.</p>
      <p style="margin:0 0 24px 0;color:#3f3f46;">Store the new codes somewhere safe ; they're your way back in if you lose your authenticator.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ securityLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:{{ onBrandPrimary }};text-decoration:none;border-radius:8px;">Manage two-factor authentication</a>
        </td></tr>
      </table>
      <p style="margin:24px 0 0 0;color:#a1a1aa;font-size:13px;">If you didn't do this, change your password immediately and review your two-factor settings.</p>`,
    text: `A fresh set of {{ count }} two-factor recovery codes was generated for your {{ appName }} account at {{ occurredAtFormatted }}. Your previous codes no longer work.

Store the new codes somewhere safe ; they're your way back in if you lose your authenticator.

Manage two-factor authentication: {{ securityLink }}

If you didn't do this, change your password immediately and review your two-factor settings.`,
    inapp: {
      subject: "Your recovery codes were replaced",
      body: "{{ count }} new recovery codes were generated ; your old codes no longer work. If this wasn't you, change your password.",
      link: "/account/security",
    },
  },
  fr: {
    subject: "Vos codes de récupération {{ appName }} ont été remplacés",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">Vos codes de récupération ont été remplacés</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">Un nouveau lot de {{ count }} codes de récupération à deux facteurs a été généré pour votre compte {{ appName }} le {{ occurredAtFormatted }}. Vos anciens codes ne fonctionnent plus.</p>
      <p style="margin:0 0 24px 0;color:#3f3f46;">Conservez les nouveaux codes dans un endroit sûr ; ils vous permettent de récupérer votre compte en cas de perte de votre authentificateur.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ securityLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:{{ onBrandPrimary }};text-decoration:none;border-radius:8px;">Gérer l'authentification à deux facteurs</a>
        </td></tr>
      </table>
      <p style="margin:24px 0 0 0;color:#a1a1aa;font-size:13px;">Si vous n'êtes pas à l'origine de cette action, changez votre mot de passe immédiatement et vérifiez vos paramètres à deux facteurs.</p>`,
    text: `Un nouveau lot de {{ count }} codes de récupération à deux facteurs a été généré pour votre compte {{ appName }} le {{ occurredAtFormatted }}. Vos anciens codes ne fonctionnent plus.

Conservez les nouveaux codes dans un endroit sûr ; ils vous permettent de récupérer votre compte en cas de perte de votre authentificateur.

Gérer l'authentification à deux facteurs : {{ securityLink }}

Si vous n'êtes pas à l'origine de cette action, changez votre mot de passe immédiatement et vérifiez vos paramètres à deux facteurs.`,
    inapp: {
      subject: "Vos codes de récupération ont été remplacés",
      body: "{{ count }} nouveaux codes de récupération ont été générés ; vos anciens codes ne fonctionnent plus. Si ce n'était pas vous, changez votre mot de passe.",
      link: "/account/security",
    },
  },
};

export default messages;
