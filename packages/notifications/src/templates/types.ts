/**
 * Per-locale message shape for one notification kind. The dispatch path
 * picks the locale slot based on `User.localePreference` (falling back
 * to `en`), interpolates `{{ var }}` against the per-kind data payload,
 * and ships:
 *   - EMAIL channel: subject + html (wrapped in EMAIL_SHELL) + text
 *   - IN_APP channel: subject + body + optional link, persisted to the
 *     Notification row directly
 *
 * Author HTML for the inner card body only ; the chrome (header band,
 * wordmark, footer) is appended by the dispatch path. Keep text bodies
 * short ; many email clients show only the first 100-ish chars in the
 * preview pane.
 */
export type LocaleMessage = {
  subject: string
  html: string
  text: string
  inapp: {
    subject: string
    body: string
    link?: string
  }
}

export type KindMessages = {
  en: LocaleMessage
  fr: LocaleMessage
}
