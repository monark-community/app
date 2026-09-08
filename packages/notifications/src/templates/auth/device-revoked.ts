import type { KindMessages } from "../types";

const messages: KindMessages = {
  en: {
    subject: "A device was signed out of your {{ appName }} account",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">A device was signed out</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">One device was signed out of your {{ appName }} account.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;color:#3f3f46;">
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Device</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ deviceLabel }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">When</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ occurredAtFormatted }}</td></tr>
      </table>
      <p style="margin:0 0 24px 0;color:#3f3f46;">If you did this from your account settings, no further action is needed. If you didn't, change your password immediately.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ securityLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:{{ onBrandPrimary }};text-decoration:none;border-radius:8px;">Review your active sessions</a>
        </td></tr>
      </table>`,
    text: `One device was signed out of your {{ appName }} account.

Device: {{ deviceLabel }}
When:   {{ occurredAtFormatted }}

If you did this from your account settings, no further action is needed. If you didn't, change your password immediately.

Review your active sessions: {{ securityLink }}`,
    inapp: {
      subject: "A device was signed out",
      body: "{{ deviceLabel }} was signed out. If this wasn't you, change your password right now.",
      link: "/account/security",
    },
  },
  fr: {
    subject: "Un appareil a été déconnecté de votre compte {{ appName }}",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">Un appareil a été déconnecté</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">Un appareil a été déconnecté de votre compte {{ appName }}.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;color:#3f3f46;">
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Appareil</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ deviceLabel }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Quand</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ occurredAtFormatted }}</td></tr>
      </table>
      <p style="margin:0 0 24px 0;color:#3f3f46;">Si vous l'avez fait depuis vos paramètres de compte, aucune action n'est requise. Sinon, changez votre mot de passe immédiatement.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ securityLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:{{ onBrandPrimary }};text-decoration:none;border-radius:8px;">Vérifier vos sessions actives</a>
        </td></tr>
      </table>`,
    text: `Un appareil a été déconnecté de votre compte {{ appName }}.

Appareil : {{ deviceLabel }}
Quand :    {{ occurredAtFormatted }}

Si vous l'avez fait depuis vos paramètres de compte, aucune action n'est requise. Sinon, changez votre mot de passe immédiatement.

Vérifier vos sessions actives : {{ securityLink }}`,
    inapp: {
      subject: "Un appareil a été déconnecté",
      body: "{{ deviceLabel }} a été déconnecté. Si ce n'était pas vous, changez votre mot de passe immédiatement.",
      link: "/account/security",
    },
  },
};

export default messages;
