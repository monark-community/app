import type { KindMessages } from "../types"

const messages: KindMessages = {
  en: {
    subject: "Your {{ appName }} account is scheduled for deletion",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">Account deletion scheduled</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">Your {{ appName }} account is scheduled for permanent deletion on {{ completesAtFormatted }}.</p>
      <p style="margin:0 0 24px 0;color:#3f3f46;">Until then, you can sign in and cancel the deletion at any time. After that date, your account and personal data will be removed.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ accountLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#18181b;text-decoration:none;border-radius:8px;">Cancel deletion</a>
        </td></tr>
      </table>`,
    text: `Your {{ appName }} account is scheduled for permanent deletion on {{ completesAtFormatted }}.

Until then, you can sign in and cancel the deletion at any time:
{{ accountLink }}`,
    inapp: {
      subject: "Account deletion scheduled",
      body: "Permanent deletion on {{ completesAtFormatted }}. You can cancel any time before then.",
      link: "/account/danger",
    },
  },
  fr: {
    subject: "Suppression de votre compte {{ appName }} programmée",
    html: `
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">Suppression du compte programmée</h1>
      <p style="margin:0 0 16px 0;color:#3f3f46;">Votre compte {{ appName }} sera définitivement supprimé le {{ completesAtFormatted }}.</p>
      <p style="margin:0 0 24px 0;color:#3f3f46;">Jusqu'à cette date, vous pouvez vous connecter et annuler la suppression à tout moment. Passé ce délai, votre compte et vos données personnelles seront effacés.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{{ brandPrimary }}" style="border-radius:8px;">
          <a href="{{ accountLink }}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#18181b;text-decoration:none;border-radius:8px;">Annuler la suppression</a>
        </td></tr>
      </table>`,
    text: `Votre compte {{ appName }} sera définitivement supprimé le {{ completesAtFormatted }}.

Jusqu'à cette date, vous pouvez annuler la suppression à tout moment :
{{ accountLink }}`,
    inapp: {
      subject: "Suppression du compte programmée",
      body: "Suppression définitive le {{ completesAtFormatted }}. Vous pouvez annuler à tout moment avant cette date.",
      link: "/account/danger",
    },
  },
}

export default messages
