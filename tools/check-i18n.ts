import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

// i18n key-parity gate. Every locale catalog must carry the exact same set of
// (flattened, dotted) message keys as the reference locale — no missing keys
// (a locale would fall back / render the key) and no extra keys (dead strings
// that drift as the reference changes). Value equality is intentionally NOT
// checked : many en/fr values are legitimately identical (brand names, ICU
// pluralization skeletons, cognates), so comparing values would be noise.
//
// This locks in the parity the app currently has and turns any future drift
// into a fast, deterministic CI failure instead of a runtime fallback nobody
// notices. Adding a new locale (e.g. es.json) automatically brings it under
// the same gate.

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");
const MESSAGES_DIR = resolve(APP_ROOT, "services/web/src/messages");
const REFERENCE_LOCALE = "en";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

// Flattens a nested message object to the set of leaf key paths ("a.b.c").
// Arrays contribute indexed paths ("a.0") so a shape change is caught too.
function flattenKeys(value: Json, prefix: string, out: Set<string>): void {
  if (value === null || typeof value !== "object") {
    out.add(prefix);
    return;
  }
  const entries: Array<[string, Json]> = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as [string, Json])
    : Object.entries(value);
  if (entries.length === 0) {
    // An empty object / array is itself a leaf for parity purposes.
    out.add(prefix);
    return;
  }
  for (const [k, v] of entries) {
    flattenKeys(v, prefix ? `${prefix}.${k}` : k, out);
  }
}

async function loadLocale(file: string): Promise<Set<string>> {
  const raw = await readFile(resolve(MESSAGES_DIR, file), "utf8");
  const parsed = JSON.parse(raw) as Json;
  const keys = new Set<string>();
  flattenKeys(parsed, "", keys);
  return keys;
}

function diff(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((k) => !b.has(k)).sort();
}

async function main() {
  const files = (await readdir(MESSAGES_DIR)).filter((f) => f.endsWith(".json"));
  const locales = files.map((f) => basename(f, ".json"));

  if (!locales.includes(REFERENCE_LOCALE)) {
    console.error(
      `check:i18n: FAIL — reference locale ${REFERENCE_LOCALE}.json not found in ${MESSAGES_DIR}`,
    );
    process.exit(1);
  }

  const keysByLocale = new Map<string, Set<string>>();
  for (const file of files) {
    try {
      keysByLocale.set(basename(file, ".json"), await loadLocale(file));
    } catch (err) {
      console.error(`check:i18n: FAIL — ${file} is not valid JSON : ${(err as Error).message}`);
      process.exit(1);
    }
  }

  const refKeys = keysByLocale.get(REFERENCE_LOCALE)!;
  let failed = false;

  for (const locale of locales) {
    if (locale === REFERENCE_LOCALE) continue;
    const localeKeys = keysByLocale.get(locale)!;
    const missing = diff(refKeys, localeKeys); // in en, not in <locale>
    const extra = diff(localeKeys, refKeys); // in <locale>, not in en

    if (missing.length === 0 && extra.length === 0) continue;
    failed = true;
    console.error(
      `check:i18n: FAIL — ${locale}.json is out of parity with ${REFERENCE_LOCALE}.json`,
    );
    if (missing.length > 0) {
      console.error(
        `  ${missing.length} key(s) present in ${REFERENCE_LOCALE} but MISSING in ${locale} :`,
      );
      for (const k of missing.slice(0, 50)) console.error(`    - ${k}`);
      if (missing.length > 50) console.error(`    … and ${missing.length - 50} more`);
    }
    if (extra.length > 0) {
      console.error(
        `  ${extra.length} key(s) present in ${locale} but ABSENT from ${REFERENCE_LOCALE} (dead) :`,
      );
      for (const k of extra.slice(0, 50)) console.error(`    + ${k}`);
      if (extra.length > 50) console.error(`    … and ${extra.length - 50} more`);
    }
  }

  if (failed) process.exit(1);

  console.log(
    `check:i18n: ok (${locales.length} locales, ${refKeys.size} keys each : ${locales.join(", ")})`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
