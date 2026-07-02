import type { KindMessages } from "../types";

const messages: KindMessages = {
  en: {
    subject: "Two-factor authentication disabled",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">Two-factor authentication is off</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">TOTP was disabled on your {{ appName }} account at {{ occurredAtFormatted }}.</p>
      <p style="margin:0 0 24px 0;color:#3f3f46;">If you made this change, no further action is needed. Sign-ins will no longer require a 6-digit code.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ securityLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#18181b;text-decoration:none;border-radius:8px;">Open security settings</a>
        </td></tr>
      </table>
      <p style="margin:24px 0 0 0;color:#a1a1aa;font-size:13px;">If you didn't request this, your account may be compromised. Re-enable TOTP and rotate your password from the security settings above.</p>`,
    text: `TOTP was disabled on your {{ appName }} account at {{ occurredAtFormatted }}.

If you made this change, no further action is needed. Sign-ins will no longer require a 6-digit code.

Open security settings: {{ securityLink }}

If you didn't request this, your account may be compromised. Re-enable TOTP and rotate your password from the security settings above.`,
    inapp: {
      subject: "Two-factor authentication disabled",
      body: "If this wasn't you, your account may be compromised. Re-enable TOTP and rotate your password.",
      link: "/account/security",
    },
  },
  fr: {
    subject: "Authentification à deux facteurs désactivée",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">L'authentification à deux facteurs est désactivée</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">TOTP a été désactivé sur votre compte {{ appName }} le {{ occurredAtFormatted }}.</p>
      <p style="margin:0 0 24px 0;color:#3f3f46;">Si vous êtes à l'origine de ce changement, aucune action n'est requise. Les connexions n'exigeront plus de code à 6 chiffres.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ securityLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#18181b;text-decoration:none;border-radius:8px;">Ouvrir les paramètres de sécurité</a>
        </td></tr>
      </table>
      <p style="margin:24px 0 0 0;color:#a1a1aa;font-size:13px;">Si ce n'était pas vous, votre compte est peut-être compromis. Réactivez TOTP et changez votre mot de passe depuis les paramètres de sécurité ci-dessus.</p>`,
    text: `TOTP a été désactivé sur votre compte {{ appName }} le {{ occurredAtFormatted }}.

Si vous êtes à l'origine de ce changement, aucune action n'est requise. Les connexions n'exigeront plus de code à 6 chiffres.

Ouvrir les paramètres de sécurité : {{ securityLink }}

Si ce n'était pas vous, votre compte est peut-être compromis. Réactivez TOTP et changez votre mot de passe depuis les paramètres de sécurité ci-dessus.`,
    inapp: {
      subject: "Authentification à deux facteurs désactivée",
      body: "Si ce n'était pas vous, votre compte est peut-être compromis. Réactivez TOTP et changez votre mot de passe.",
      link: "/account/security",
    },
  },
};

export default messages;
