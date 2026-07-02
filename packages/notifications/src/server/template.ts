/**
 * Tiny template renderer. Supports two constructs ; intentionally not
 * a full Mustache / Go-template port:
 *
 *   {{ varName }}                                ; interpolation
 *   {{ if eq locale "fr" }}…{{ else }}…{{ end }} ; locale branching
 *
 * Variables come from a flat `Record<string, string>` ; complex types
 * are stringified by the caller (dates → ISO/locale-formatted, etc.) so
 * the renderer stays ignorant of i18n + formatting concerns.
 *
 * Templates live as TS modules under `src/templates/` so Next.js bundles
 * them cleanly without runtime fs access ; the email shell is a string
 * constant in `templates/_partials/email-shell.ts`.
 */

export type TemplateVars = Record<string, string>;

export function renderString(raw: string, vars: TemplateVars): string {
  let out = expandLocaleBranches(raw, vars.locale ?? "en");
  out = interpolateVars(out, vars);
  return out;
}

const LOCALE_BRANCH_RE =
  /\{\{\s*if\s+eq\s+locale\s+"([a-zA-Z-]+)"\s*\}\}([\s\S]*?)(?:\{\{\s*else\s*\}\}([\s\S]*?))?\{\{\s*end\s*\}\}/g;

function expandLocaleBranches(input: string, locale: string): string {
  return input.replace(LOCALE_BRANCH_RE, (_, target, ifBranch, elseBranch = "") => {
    return locale === target ? ifBranch : elseBranch;
  });
}

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

function interpolateVars(input: string, vars: TemplateVars): string {
  return input.replace(VAR_RE, (full, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return vars[name] ?? "";
    }
    // Leave unrecognised tokens visible so template authors notice in dev.
    return full;
  });
}
