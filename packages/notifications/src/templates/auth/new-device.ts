import type { KindMessages } from "../types";

const messages: KindMessages = {
  en: {
    subject: "New sign-in on {{ appName }}",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">New sign-in on your account</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">We noticed a new sign-in on {{ appName }}.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;color:#3f3f46;">
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Device</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ deviceLabel }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Where</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ deviceWhere }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">When</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ seenAtFormatted }}</td></tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ revokeLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:{{ onBrandPrimary }};text-decoration:none;border-radius:8px;">If that wasn't you, revoke this device</a>
        </td></tr>
      </table>
      <p style="margin:24px 0 0 0;color:#a1a1aa;font-size:13px;">If you recognise this sign-in, you can safely ignore this email.</p>`,
    text: `We noticed a new sign-in on {{ appName }}.

Device: {{ deviceLabel }}
Where:  {{ deviceWhere }}
When:   {{ seenAtFormatted }}

If that wasn't you, revoke this device immediately:
{{ revokeLink }}`,
    inapp: {
      subject: "New sign-in on your account",
      body: "{{ deviceLabel }} from {{ deviceWhere }}. If this wasn't you, revoke it from Account > Security.",
      link: "/account/security",
    },
  },
  fr: {
    subject: "Nouvelle connexion sur {{ appName }}",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">Nouvelle connexion sur votre compte</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">Nous avons détecté une nouvelle connexion sur {{ appName }}.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;color:#3f3f46;">
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Appareil</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ deviceLabel }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Lieu</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ deviceWhere }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Quand</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ seenAtFormatted }}</td></tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ revokeLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:{{ onBrandPrimary }};text-decoration:none;border-radius:8px;">Si ce n'était pas vous, révoquez cet appareil</a>
        </td></tr>
      </table>
      <p style="margin:24px 0 0 0;color:#a1a1aa;font-size:13px;">Si vous reconnaissez cette connexion, vous pouvez ignorer ce message.</p>`,
    text: `Nouvelle connexion détectée sur {{ appName }}.

Appareil : {{ deviceLabel }}
Lieu :     {{ deviceWhere }}
Quand :    {{ seenAtFormatted }}

Si ce n'était pas vous, révoquez immédiatement cet appareil :
{{ revokeLink }}`,
    inapp: {
      subject: "Nouvelle connexion sur votre compte",
      body: "{{ deviceLabel }} depuis {{ deviceWhere }}. Si ce n'était pas vous, révoquez l'appareil depuis Compte > Sécurité.",
      link: "/account/security",
    },
  },
};

export default messages;
