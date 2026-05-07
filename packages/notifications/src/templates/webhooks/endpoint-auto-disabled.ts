import type { KindMessages } from "../types"

const messages: KindMessages = {
  en: {
    subject: "Webhook endpoint auto-disabled — {{ endpointUrl }}",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">Webhook endpoint disabled</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">A webhook endpoint hit {{ consecutiveFailures }} consecutive delivery failures and was automatically disabled. New events will not be queued for it until you re-enable it. Pre-existing pending deliveries continue to drain.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;color:#3f3f46;">
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Endpoint</td><td style="padding:4px 0;color:#18181b;font-size:14px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">{{ endpointUrl }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Consecutive failures</td><td style="padding:4px 0;color:#b91c1c;font-size:14px;">{{ consecutiveFailures }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">When</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ occurredAtFormatted }}</td></tr>
      </table>
      <p style="margin:0 0 16px 0;color:#3f3f46;font-weight:600;">To recover :</p>
      <ol style="margin:0 0 24px 0;padding-left:20px;color:#3f3f46;">
        <li style="margin-bottom:6px;">Inspect the delivery list for the recurring error.</li>
        <li style="margin-bottom:6px;">Fix the receiver (URL change, certificate, signature verification, etc.).</li>
        <li style="margin-bottom:6px;">Set the endpoint's status back to active. The failure counter resets on the next successful delivery.</li>
      </ol>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ webhookEndpointLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#18181b;text-decoration:none;border-radius:8px;">Open endpoint</a>
        </td></tr>
      </table>`,
    text: `A webhook endpoint hit {{ consecutiveFailures }} consecutive delivery failures and was automatically disabled.

Endpoint:             {{ endpointUrl }}
Consecutive failures: {{ consecutiveFailures }}
When:                 {{ occurredAtFormatted }}

New events will not be queued for it until you re-enable it. Pre-existing pending deliveries continue to drain.

To recover:
  1. Inspect the delivery list for the recurring error.
  2. Fix the receiver (URL change, certificate, signature verification, etc.).
  3. Set the endpoint's status back to active. The failure counter resets on the next successful delivery.

Open endpoint: {{ webhookEndpointLink }}`,
    inapp: {
      subject: "Webhook endpoint auto-disabled",
      body: "{{ endpointUrl }} disabled after {{ consecutiveFailures }} consecutive failures.",
      link: "{{ webhookEndpointLink }}",
    },
  },
  fr: {
    subject: "Point de terminaison webhook désactivé — {{ endpointUrl }}",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">Point de terminaison webhook désactivé</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">Un point de terminaison de webhook a atteint {{ consecutiveFailures }} échecs consécutifs et a été automatiquement désactivé. Aucun nouvel événement ne sera mis en file d'attente tant qu'il n'est pas réactivé. Les livraisons en file d'attente continuent à être traitées.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;color:#3f3f46;">
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Point de terminaison</td><td style="padding:4px 0;color:#18181b;font-size:14px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">{{ endpointUrl }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Échecs consécutifs</td><td style="padding:4px 0;color:#b91c1c;font-size:14px;">{{ consecutiveFailures }}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#71717a;font-size:14px;">Quand</td><td style="padding:4px 0;color:#18181b;font-size:14px;">{{ occurredAtFormatted }}</td></tr>
      </table>
      <p style="margin:0 0 16px 0;color:#3f3f46;font-weight:600;">Pour récupérer :</p>
      <ol style="margin:0 0 24px 0;padding-left:20px;color:#3f3f46;">
        <li style="margin-bottom:6px;">Consultez la liste des livraisons pour identifier l'erreur récurrente.</li>
        <li style="margin-bottom:6px;">Corrigez le destinataire (changement d'URL, certificat, vérification de signature, etc.).</li>
        <li style="margin-bottom:6px;">Remettez le statut du point de terminaison à actif. Le compteur d'échecs est réinitialisé à la prochaine livraison réussie.</li>
      </ol>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ webhookEndpointLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#18181b;text-decoration:none;border-radius:8px;">Ouvrir le point de terminaison</a>
        </td></tr>
      </table>`,
    text: `Un point de terminaison de webhook a atteint {{ consecutiveFailures }} échecs consécutifs et a été automatiquement désactivé.

Point de terminaison : {{ endpointUrl }}
Échecs consécutifs :   {{ consecutiveFailures }}
Quand :                {{ occurredAtFormatted }}

Aucun nouvel événement ne sera mis en file d'attente tant qu'il n'est pas réactivé. Les livraisons en file d'attente continuent à être traitées.

Pour récupérer :
  1. Consultez la liste des livraisons pour identifier l'erreur récurrente.
  2. Corrigez le destinataire (changement d'URL, certificat, vérification de signature, etc.).
  3. Remettez le statut du point de terminaison à actif. Le compteur d'échecs est réinitialisé à la prochaine livraison réussie.

Ouvrir le point de terminaison : {{ webhookEndpointLink }}`,
    inapp: {
      subject: "Point de terminaison webhook désactivé",
      body: "{{ endpointUrl }} désactivé après {{ consecutiveFailures }} échecs consécutifs.",
      link: "{{ webhookEndpointLink }}",
    },
  },
}

export default messages
