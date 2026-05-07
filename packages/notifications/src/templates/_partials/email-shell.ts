/**
 * Branded email shell. Wraps the per-kind body in the standard product
 * chrome (brand-coloured top bar, logo + wordmark, white card on muted
 * background, footer line). Mirrors the chrome we ship in
 * `supabase/templates/confirmation.html` so transactional emails feel
 * uniform across Supabase-rendered (signup confirm, email change,
 * recovery) and notifications-rendered (new device, password change,
 * etc.) sends.
 *
 * Brand surfacing :
 *   - `{{ logoUrl }}` ; `<img>` at the top, falls back to the wordmark
 *     when the recipient's mail client blocks remote images. Composed
 *     in `enrichVars` from `appUrl + BRANDING.logoSrc` so it
 *     auto-tracks per-deployment / per-request hosts.
 *   - `{{ appName }}` ; wordmark below the logo + footer copyright.
 *   - `{{ brandPrimary }}` ; top accent bar, wordmark colour, all CTA
 *     button backgrounds.
 *
 * Slots: `{{ subject }}`, `{{ body }}`, `{{ locale }}`, plus the brand
 * vars above. All supplied by the branding template-vars layer in
 * `enrichVars`. Locale also drives `<html lang="…">`.
 *
 * Neutral colours (#18181b for text, #3f3f46 for body, #a1a1aa for
 * muted, #e4e4e7 for borders, #f4f4f5 for the page background) are
 * left as literals on purpose : email clients have spotty CSS
 * variable support, and these are the standard "zinc" neutral ramp
 * any product looks fine in. Override per-product by editing this
 * shell directly when retargeting (the white-label README calls this
 * out).
 */
export const EMAIL_SHELL = `<!doctype html>
<html lang="{{ locale }}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>{{ subject }}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:12px;border:1px solid #e4e4e7;">
            <tr>
              <td style="background-color:{{ brandPrimary }};height:4px;line-height:4px;font-size:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <img src="{{ logoUrl }}" alt="{{ appName }}" width="40" height="40" style="display:block;border:0;outline:none;text-decoration:none;width:40px;height:40px;" />
                <span style="margin-top:8px;display:inline-block;font-size:22px;font-weight:800;color:{{ brandPrimary }};letter-spacing:-0.02em;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;">{{ appName }}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 32px 32px;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;color:#18181b;font-size:16px;line-height:1.6;">
                {{ body }}
              </td>
            </tr>
          </table>
          <p style="margin:24px 0 0 0;font-family:'Nunito Sans','Helvetica Neue',Helvetica,Arial,sans-serif;color:#a1a1aa;font-size:12px;">
            © {{ appName }}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`
