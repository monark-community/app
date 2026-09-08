import type { KindMessages } from "../types";

const messages: KindMessages = {
  en: {
    subject: "A recovery code was used on your {{ appName }} account",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">A recovery code was used</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">One of your two-factor recovery codes was used to sign in to your {{ appName }} account at {{ occurredAtFormatted }}. Each recovery code works only once.</p>
      <p style="margin:0 0 24px 0;color:#3f3f46;">You have {{ remainingCodes }} recovery code(s) left. If you're running low, generate a fresh set so you don't get locked out.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ securityLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:{{ onBrandPrimary }};text-decoration:none;border-radius:8px;">Manage two-factor authentication</a>
        </td></tr>
      </table>
      <p style="margin:24px 0 0 0;color:#a1a1aa;font-size:13px;">If this wasn't you, change your password immediately ; someone may have access to your recovery codes.</p>`,
    text: `One of your two-factor recovery codes was used to sign in to your {{ appName }} account at {{ occurredAtFormatted }}.

You have {{ remainingCodes }} recovery code(s) left. If you're running low, generate a fresh set so you don't get locked out.

Manage two-factor authentication: {{ securityLink }}

If this wasn't you, change your password immediately.`,
    inapp: {
      subject: "A recovery code was used",
      body: "A two-factor recovery code was used. {{ remainingCodes }} left. If this wasn't you, change your password now.",
      link: "/account/security",
    },
  },
  fr: {
    subject: "Un code de récupération a été utilisé sur votre compte {{ appName }}",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">Un code de récupération a été utilisé</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">Un de vos codes de récupération à deux facteurs a été utilisé pour vous connecter à votre compte {{ appName }} le {{ occurredAtFormatted }}. Chaque code de récupération ne fonctionne qu'une seule fois.</p>
      <p style="margin:0 0 24px 0;color:#3f3f46;">Il vous reste {{ remainingCodes }} code(s) de récupération. S'il vous en reste peu, générez-en de nouveaux pour ne pas être bloqué.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ securityLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:{{ onBrandPrimary }};text-decoration:none;border-radius:8px;">Gérer l'authentification à deux facteurs</a>
        </td></tr>
      </table>
      <p style="margin:24px 0 0 0;color:#a1a1aa;font-size:13px;">Si ce n'était pas vous, changez votre mot de passe immédiatement ; quelqu'un a peut-être accès à vos codes de récupération.</p>`,
    text: `Un de vos codes de récupération à deux facteurs a été utilisé pour vous connecter à votre compte {{ appName }} le {{ occurredAtFormatted }}.

Il vous reste {{ remainingCodes }} code(s) de récupération. S'il vous en reste peu, générez-en de nouveaux pour ne pas être bloqué.

Gérer l'authentification à deux facteurs : {{ securityLink }}

Si ce n'était pas vous, changez votre mot de passe immédiatement.`,
    inapp: {
      subject: "Un code de récupération a été utilisé",
      body: "Un code de récupération à deux facteurs a été utilisé. {{ remainingCodes }} restant(s). Si ce n'était pas vous, changez votre mot de passe.",
      link: "/account/security",
    },
  },
};

export default messages;
