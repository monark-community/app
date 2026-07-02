import type { KindMessages } from "../types";

// IN_APP only ; cancellation reverses the deletion path so the user is
// already in-app to take the action — no email needed.
const messages: KindMessages = {
  en: {
    subject: "Account deletion canceled",
    html: "",
    text: "",
    inapp: {
      subject: "Account deletion canceled",
      body: "Your account is no longer scheduled for deletion.",
      link: "/account",
    },
  },
  fr: {
    subject: "Suppression du compte annulée",
    html: "",
    text: "",
    inapp: {
      subject: "Suppression du compte annulée",
      body: "Votre compte n'est plus programmé pour suppression.",
      link: "/account",
    },
  },
};

export default messages;
