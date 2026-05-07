import type { KindMessages } from "../types"

const messages: KindMessages = {
  en: {
    subject: "Two-factor authentication enabled",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">Two-factor authentication is on</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">You enabled TOTP on your {{ appName }} account at {{ occurredAtFormatted }}. Future sign-ins from unrecognised devices will require a code from your authenticator app.</p>
      <p style="margin:0 0 0 0;color:#3f3f46;">Make sure you've stored your recovery codes somewhere safe ; they're your way back in if you lose access to your authenticator.</p>`,
    text: `You enabled TOTP on your {{ appName }} account at {{ occurredAtFormatted }}.

Future sign-ins from unrecognised devices will require a code from your authenticator app.

Make sure you've stored your recovery codes somewhere safe.`,
    inapp: {
      subject: "Two-factor authentication enabled",
      body: "Sign-ins from new devices will now require a code from your authenticator app.",
      link: "/account/security",
    },
  },
  fr: {
    subject: "Authentification à deux facteurs activée",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">L'authentification à deux facteurs est activée</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">Vous avez activé TOTP sur votre compte {{ appName }} le {{ occurredAtFormatted }}. Les futures connexions depuis un appareil inconnu nécessiteront un code de votre application d'authentification.</p>
      <p style="margin:0 0 0 0;color:#3f3f46;">Assurez-vous d'avoir conservé vos codes de récupération dans un endroit sûr ; ils vous permettent de récupérer votre compte en cas de perte de votre authentificateur.</p>`,
    text: `Vous avez activé TOTP sur votre compte {{ appName }} le {{ occurredAtFormatted }}.

Les futures connexions depuis un appareil inconnu nécessiteront un code de votre application d'authentification.

Conservez vos codes de récupération dans un endroit sûr.`,
    inapp: {
      subject: "Authentification à deux facteurs activée",
      body: "Les connexions depuis un nouvel appareil exigeront désormais un code de votre application d'authentification.",
      link: "/account/security",
    },
  },
}

export default messages
