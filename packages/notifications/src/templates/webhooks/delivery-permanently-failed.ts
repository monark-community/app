import type { KindMessages } from "../types";

const messages: KindMessages = {
  en: {
    subject: "Webhook delivery failed permanently — {{ endpointUrl }}",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">Webhook delivery exhausted retries</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">A webhook delivery failed all {{ attempts }} attempts and has been marked permanently failed. The endpoint stays active ; subsequent events will continue trying. After {{ failureLimit }} consecutive failures the endpoint will be auto-disabled.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;color:#3f3f46;">
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Endpoint</td><td style="padding:4px 0;color:#18181b;font-size:14px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">{{ endpointUrl }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Event</td><td style="padding:4px 0;color:#18181b;font-size:14px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">{{ eventType }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Attempts</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ attempts }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Last error</td><td style="padding:4px 0;color:#b91c1c;font-size:14px;">{{ reason }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">When</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ occurredAtFormatted }}</td></tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ webhookDeliveriesLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:{{ onBrandPrimary }};text-decoration:none;border-radius:8px;">Inspect deliveries</a>
        </td></tr>
      </table>
      <p style="margin:24px 0 0 0;color:#a1a1aa;font-size:13px;">If the receiver is intentionally down (deploy in progress, planned maintenance), no action is needed. Otherwise check the receiver's logs for the error above.</p>`,
    text: `A webhook delivery failed all {{ attempts }} attempts and has been marked permanently failed.

Endpoint:    {{ endpointUrl }}
Event:       {{ eventType }}
Attempts:    {{ attempts }}
Last error:  {{ reason }}
When:        {{ occurredAtFormatted }}

The endpoint stays active ; subsequent events will continue trying. After {{ failureLimit }} consecutive failures the endpoint will be auto-disabled.

Inspect deliveries: {{ webhookDeliveriesLink }}`,
    inapp: {
      subject: "Webhook delivery failed",
      body: "{{ eventType }} → {{ endpointUrl }} exhausted {{ attempts }} retries. Last error : {{ reason }}.",
      link: "{{ webhookDeliveriesLink }}",
    },
  },
  fr: {
    subject: "Échec définitif d'une livraison webhook — {{ endpointUrl }}",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">Une livraison webhook a épuisé ses tentatives</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">Une livraison de webhook a échoué après {{ attempts }} tentatives et est désormais marquée comme définitivement échouée. Le point de terminaison reste actif ; les événements suivants continueront à être tentés. Après {{ failureLimit }} échecs consécutifs, le point de terminaison sera automatiquement désactivé.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;color:#3f3f46;">
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Point de terminaison</td><td style="padding:4px 0;color:#18181b;font-size:14px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">{{ endpointUrl }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Événement</td><td style="padding:4px 0;color:#18181b;font-size:14px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">{{ eventType }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Tentatives</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ attempts }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Dernière erreur</td><td style="padding:4px 0;color:#b91c1c;font-size:14px;">{{ reason }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Quand</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ occurredAtFormatted }}</td></tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ webhookDeliveriesLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:{{ onBrandPrimary }};text-decoration:none;border-radius:8px;">Inspecter les livraisons</a>
        </td></tr>
      </table>
      <p style="margin:24px 0 0 0;color:#a1a1aa;font-size:13px;">Si le destinataire est volontairement hors-ligne (déploiement, maintenance planifiée), aucune action n'est requise. Sinon, vérifiez les journaux du destinataire pour l'erreur ci-dessus.</p>`,
    text: `Une livraison de webhook a échoué après {{ attempts }} tentatives et est désormais marquée comme définitivement échouée.

Point de terminaison : {{ endpointUrl }}
Événement :           {{ eventType }}
Tentatives :          {{ attempts }}
Dernière erreur :     {{ reason }}
Quand :               {{ occurredAtFormatted }}

Le point de terminaison reste actif ; les événements suivants continueront à être tentés. Après {{ failureLimit }} échecs consécutifs, le point de terminaison sera automatiquement désactivé.

Inspecter les livraisons : {{ webhookDeliveriesLink }}`,
    inapp: {
      subject: "Livraison webhook échouée",
      body: "{{ eventType }} → {{ endpointUrl }} a épuisé {{ attempts }} tentatives. Dernière erreur : {{ reason }}.",
      link: "{{ webhookDeliveriesLink }}",
    },
  },
};

export default messages;
