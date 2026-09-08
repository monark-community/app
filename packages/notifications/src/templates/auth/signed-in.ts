import type { KindMessages } from "../types";

const messages: KindMessages = {
  en: {
    subject: "New sign-in on {{ appName }}",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">A new sign-in on your account</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">Your {{ appName }} account was just signed in to.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;color:#3f3f46;">
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Device</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ deviceLabel }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">When</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ occurredAtFormatted }}</td></tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ securityLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:{{ onBrandPrimary }};text-decoration:none;border-radius:8px;">Review your active sessions</a>
        </td></tr>
      </table>
      <p style="margin:24px 0 0 0;color:#a1a1aa;font-size:13px;">If this was you, no action is needed. You're receiving this because you turned on sign-in alerts.</p>`,
    text: `Your {{ appName }} account was just signed in to.

Device: {{ deviceLabel }}
When:   {{ occurredAtFormatted }}

Review your active sessions: {{ securityLink }}

If this was you, no action is needed. You're receiving this because you turned on sign-in alerts.`,
    inapp: {
      subject: "New sign-in on your account",
      body: "Signed in on {{ deviceLabel }}. If this wasn't you, review your sessions from Account > Security.",
      link: "/account/security",
    },
  },
  fr: {
    subject: "Nouvelle connexion sur {{ appName }}",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">Une nouvelle connexion sur votre compte</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">Une connexion vient d'avoir lieu sur votre compte {{ appName }}.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;color:#3f3f46;">
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Appareil</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ deviceLabel }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Quand</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ occurredAtFormatted }}</td></tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ securityLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:{{ onBrandPrimary }};text-decoration:none;border-radius:8px;">Vérifier vos sessions actives</a>
        </td></tr>
      </table>
      <p style="margin:24px 0 0 0;color:#a1a1aa;font-size:13px;">Si c'était vous, aucune action n'est requise. Vous recevez ce message car vous avez activé les alertes de connexion.</p>`,
    text: `Une connexion vient d'avoir lieu sur votre compte {{ appName }}.

Appareil : {{ deviceLabel }}
Quand :    {{ occurredAtFormatted }}

Vérifier vos sessions actives : {{ securityLink }}

Si c'était vous, aucune action n'est requise. Vous recevez ce message car vous avez activé les alertes de connexion.`,
    inapp: {
      subject: "Nouvelle connexion sur votre compte",
      body: "Connexion sur {{ deviceLabel }}. Si ce n'était pas vous, vérifiez vos sessions depuis Compte > Sécurité.",
      link: "/account/security",
    },
  },
};

export default messages;
