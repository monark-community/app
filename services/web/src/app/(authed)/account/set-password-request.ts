/**
 * How the Connected accounts card asks the password card to open its
 * set-password dialog.
 *
 * The two are siblings rendered by [security/page.tsx](./security/page.tsx),
 * a server component, so there is no client parent to hold lifted state
 * and no context to thread through without making that page a client
 * boundary. A URL search param plus a same-tab event keeps both cards
 * independent:
 *
 * - the **param** carries the request, so `/account/security?password=set`
 *   works as a deep link and survives a full page load ;
 * - the **event** covers the same-page case, where React never remounts
 *   the password card and `useSearchParams` alone wouldn't re-fire.
 *
 * The password card clears the param once it has acted, so a refresh
 * doesn't reopen a dialog the user already dismissed.
 */
export const SET_PASSWORD_PARAM = "password";
export const SET_PASSWORD_VALUE = "set";
export const SET_PASSWORD_EVENT = "monark:set-password-request";
