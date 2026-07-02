import type { KindMessages } from "../types";

const messages: KindMessages = {
  en: {
    subject: "Your {{ appName }} password was changed",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">Your password was changed</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">The password on your {{ appName }} account was changed at {{ occurredAtFormatted }}.</p>
      <p style="margin:0 0 16px 0;color:#3f3f46;">If you made this change, no further action is needed.</p>
      <p style="margin:0 0 8px 0;color:#3f3f46;font-weight:600;">Wasn't you?</p>
      <p style="margin:0 0 8px 0;color:#3f3f46;">Your account may be compromised. Take these steps right now:</p>
      <ol style="margin:0 0 24px 0;padding-left:20px;color:#3f3f46;">
        <li style="margin-bottom:6px;">Sign in and revoke every active session ("Revoke all" under Trusted devices).</li>
        <li style="margin-bottom:6px;">Reset your password again so the attacker's copy stops working.</li>
        <li style="margin-bottom:6px;">If two-factor authentication isn't on yet, enable it from Account &rarr; Security.</li>
      </ol>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ securityLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#18181b;text-decoration:none;border-radius:8px;">Lock down my account</a>
        </td></tr>
      </table>`,
    text: `The password on your {{ appName }} account was changed at {{ occurredAtFormatted }}.

If you made this change, no further action is needed.

Wasn't you ? Your account may be compromised. Take these steps right now :

  1. Sign in and revoke every active session ("Revoke all" under Trusted devices).
  2. Reset your password again so the attacker's copy stops working.
  3. If two-factor authentication isn't on yet, enable it from Account > Security.

Lock down your account : {{ securityLink }}`,
    inapp: {
      subject: "Your password was changed",
      body: "If this wasn't you, secure your account from Account > Security right now.",
      link: "/account/security",
    },
  },
  fr: {
    subject: "Votre mot de passe {{ appName }} a été changé",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">Votre mot de passe a été changé</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">Le mot de passe de votre compte {{ appName }} a été modifié le {{ occurredAtFormatted }}.</p>
      <p style="margin:0 0 16px 0;color:#3f3f46;">Si vous êtes à l'origine de ce changement, aucune action n'est requise.</p>
      <p style="margin:0 0 8px 0;color:#3f3f46;font-weight:600;">Ce n'était pas vous ?</p>
      <p style="margin:0 0 8px 0;color:#3f3f46;">Votre compte est peut-être compromis. Suivez ces étapes immédiatement :</p>
      <ol style="margin:0 0 24px 0;padding-left:20px;color:#3f3f46;">
        <li style="margin-bottom:6px;">Connectez-vous et révoquez toutes les sessions actives (« Tout révoquer » dans Appareils de confiance).</li>
        <li style="margin-bottom:6px;">Réinitialisez votre mot de passe pour invalider la copie de l'attaquant.</li>
        <li style="margin-bottom:6px;">Si l'authentification à deux facteurs n'est pas activée, activez-la depuis Compte &rarr; Sécurité.</li>
      </ol>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ securityLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#18181b;text-decoration:none;border-radius:8px;">Sécuriser mon compte</a>
        </td></tr>
      </table>`,
    text: `Le mot de passe de votre compte {{ appName }} a été modifié le {{ occurredAtFormatted }}.

Si vous êtes à l'origine de ce changement, aucune action n'est requise.

Ce n'était pas vous ? Votre compte est peut-être compromis. Suivez ces étapes immédiatement :

  1. Connectez-vous et révoquez toutes les sessions actives (« Tout révoquer » dans Appareils de confiance).
  2. Réinitialisez votre mot de passe pour invalider la copie de l'attaquant.
  3. Si l'authentification à deux facteurs n'est pas activée, activez-la depuis Compte > Sécurité.

Sécuriser votre compte : {{ securityLink }}`,
    inapp: {
      subject: "Votre mot de passe a été changé",
      body: "Si ce n'était pas vous, sécurisez votre compte depuis Compte > Sécurité immédiatement.",
      link: "/account/security",
    },
  },
};

export default messages;
