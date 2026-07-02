import type { KindMessages } from "../types";

// IN_APP only ; Supabase already mails both addresses on the change.
// We carry an in-app receipt so the user has the history entry inside the app.
const messages: KindMessages = {
  en: {
    subject: "Email address updated",
    html: "",
    text: "",
    inapp: {
      subject: "Email address updated",
      body: "{{ previousEmail }} → {{ newEmail }}",
      link: "/account",
    },
  },
  fr: {
    subject: "Adresse e-mail mise à jour",
    html: "",
    text: "",
    inapp: {
      subject: "Adresse e-mail mise à jour",
      body: "{{ previousEmail }} → {{ newEmail }}",
      link: "/account",
    },
  },
};

export default messages;
