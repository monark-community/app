import { pickContrastForeground } from "@monark/common/color";
import { EMAIL_SHELL } from "../templates";
import { baseTemplateVars, resolveOrgBranding } from "./enrich";
import { renderString, type TemplateVars } from "./template";

/**
 * Render a one-off email in the same branded shell the notification
 * dispatcher uses — wordmark, org logo, brand accent bar, footer.
 *
 * Why this exists separately from `notify()` : the dispatcher is
 * addressed to a **User**. It looks the row up by id, honours that
 * user's per-channel preferences, and writes an in-app `Notification`
 * row alongside the email. A couple of emails legitimately have no user
 * to address — an organization invite and a public-form invite both go
 * to someone who does not have an account yet, which is the entire
 * point of them. Those two used to hand-roll a bare HTML fragment with
 * a hardcoded brand colour and no shell at all, so they were the only
 * outbound mail that ignored the org's logo and colour.
 *
 * This gives them the shell without pretending they are notifications:
 * no kind registration, no preference check, no in-app row, no
 * delivery tracking. Callers still own `sendMail` and their own
 * best-effort error handling.
 *
 * `bodyHtml` is inserted as the shell's `{{ body }}`. It may reference
 * the shell's brand tokens — most usefully `{{ brandPrimary }}` for a
 * CTA background and `{{ onBrandPrimary }}` for its label, which keeps
 * the button readable whatever colour the operator picked.
 */
export async function renderBrandedEmail(input: {
  subject: string;
  bodyHtml: string;
  locale?: "en" | "fr";
}): Promise<string> {
  const locale = input.locale ?? "en";
  const branding = await resolveOrgBranding();
  const vars: TemplateVars = baseTemplateVars(locale);

  if (branding.logoUrl) {
    vars.logoUrl = branding.logoUrl;
    vars.logoHtml = `<img src="${branding.logoUrl}" alt="${vars.appName ?? ""}" width="40" height="40" style="display:block;border:0;outline:none;text-decoration:none;width:40px;height:40px;" />`;
  }
  if (branding.primaryColor) {
    vars.brandPrimary = branding.primaryColor;
    vars.onBrandPrimary = pickContrastForeground(branding.primaryColor);
  }

  return renderString(EMAIL_SHELL, {
    ...vars,
    locale,
    subject: input.subject,
    body: renderString(input.bodyHtml, vars),
  });
}
