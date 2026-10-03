#!/usr/bin/env node
// Lints Monark docs against the monark-docs skill's rules : page type, word
// budget, user-facing jargon, house punctuation, storyline wiring.
//
//   node .claude/skills/monark-docs/scripts/docs-lint.mjs [paths…] [--report] [--json]
//
// With no paths, lints every published folder. --report prints a per-folder
// summary (for audits) instead of per-file findings. Exit code 1 when any
// error-level finding is reported, so it can gate CI later.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const REPORT = args.includes("--report");
const JSON_OUT = args.includes("--json");
const targets = args.filter((a) => !a.startsWith("--"));

const NEW_SECTIONS = [
  "get-started",
  "use",
  "administer",
  "build",
  "reference",
  "concepts",
  "operate",
  "decisions",
];
const LEGACY_SECTIONS = ["user-guide", "technical-documentation"];
const USER_FACING = ["get-started", "use", "administer", "user-guide"];

const BUDGETS = {
  tutorial: [400, 900],
  "how-to": [80, 350],
  reference: [0, Infinity],
  concept: [300, 900],
  runbook: [150, 700],
  decision: [300, 800],
  landing: [20, 200],
};

// Phrases the style guide cuts on sight. [pattern, message]
const BANNED = [
  [/—/, "em-dash; house style uses two sentences, `;` or `:`"],
  [/shipped behaviou?r only/i, "provenance disclaimer; every page documents shipped behaviour"],
  [
    /\bthis (page|doc|document|file|section) (covers|describes|is (about|for)|explains)\b/i,
    "throat-clearing opener; start with the first useful sentence",
  ],
  [/that is what this doc is for/i, "meta-commentary"],
  [
    /lives with the package on purpose|travels with the module/i,
    "developer note on a reader page; belongs in the README",
  ],
  [/\bleverage\b/i, "use 'use'"],
  [/\b(simply|just|easily)\b/i, "minimizer; cut it"],
  [/\bplease note\b|\bnote that\b/i, "filler; state the fact"],
];

// Implementation vocabulary that must not appear on user-facing pages.
const JARGON = [
  [
    /`\/(admin|account|data|automation|kanban|wiki|calendar)[^`]*`/,
    "route path on a user page; name the place in the UI instead",
  ],
  [/@monark\//, "package name on a user page"],
  [/\btRPC\b|\bPrisma\b|\bevent bus\b/i, "implementation detail on a user page"],
  [/\b(SYSADMIN|ADMIN)\b/, "role key on a user page; say 'admins' or 'system administrators'"],
  [/`[a-z-]+\.[a-z]+(-[a-z]+)+`/, "permission or flag key on a user page"],
];

// ── collect ────────────────────────────────────────────────────────────────

function defaultTargets() {
  const out = [];
  for (const s of [...NEW_SECTIONS, ...LEGACY_SECTIONS]) out.push(path.join("docs", s));
  const pkgs = path.join(ROOT, "packages");
  if (fs.existsSync(pkgs)) {
    for (const p of fs.readdirSync(pkgs)) out.push(path.join("packages", p, "docs"));
  }
  return out.filter((t) => fs.existsSync(path.join(ROOT, t)));
}

function walk(target, files = []) {
  const abs = path.resolve(ROOT, target);
  if (!fs.existsSync(abs)) return files;
  const stat = fs.statSync(abs);
  if (stat.isFile()) {
    if (abs.endsWith(".md")) files.push(abs);
    return files;
  }
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    walk(path.join(abs, entry.name), files);
  }
  return files;
}

// ── parse ──────────────────────────────────────────────────────────────────

function parse(file) {
  const text = fs.readFileSync(file, "utf-8").replace(/\r\n/g, "\n");
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?/);
  const front = {};
  if (fm) {
    for (const line of fm[1].split("\n")) {
      const m = line.match(/^(\w[\w-]*):\s*(.*)$/);
      if (m) front[m[1]] = m[2].trim();
    }
  }
  const body = fm ? text.slice(fm[0].length) : text;
  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
  // Prose only : drop code blocks, tables, headings, and link targets.
  const prose = body
    .replace(/```[\s\S]*?```/g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("|") && !l.trim().startsWith("#"))
    .join("\n")
    .replace(/\]\([^)]*\)/g, "]");
  const words = (prose.match(/[\p{L}\p{N}'’]+/gu) ?? []).length;
  const proseLines = body.replace(/```[\s\S]*?```/g, (b) => b.replace(/[^\n]/g, "")).split("\n");
  return { text, body, front, title, words, proseLines };
}

/** Which section a file belongs to, and whether it is user-facing. */
function classify(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  let m = rel.match(/^docs\/([^/]+)\//);
  if (m) return { rel, section: m[1] };
  m = rel.match(/^packages\/[^/]+\/docs\/([^/]+)\//);
  if (m) return { rel, section: m[1] };
  if (/^packages\/[^/]+\/docs\/user-guide\.md$/.test(rel)) return { rel, section: "user-guide" };
  return { rel, section: "other" };
}

// ── rules ──────────────────────────────────────────────────────────────────

/** Whether a page is the last sibling linked from its folder's _index.md. */
function isLastInOrder(file) {
  const index = path.join(path.dirname(file), "_index.md");
  if (!fs.existsSync(index)) return false;
  const links = [...fs.readFileSync(index, "utf-8").matchAll(/\]\(([^)/#]+\.md)\)/g)].map(
    (m) => m[1],
  );
  return links.length > 0 && links[links.length - 1] === path.basename(file);
}

function lint(file) {
  const { rel, section } = classify(file);
  const doc = parse(file);
  const findings = [];
  const add = (level, rule, msg, line) => findings.push({ file: rel, level, rule, msg, line });
  const isNew = NEW_SECTIONS.includes(section);
  const isIndex = path.basename(file) === "_index.md";
  const type = doc.front.type;

  // Type
  if (!type) {
    add(isNew ? "error" : "info", "type", "no `type:` in frontmatter");
  } else if (!BUDGETS[type]) {
    add("error", "type", `unknown type '${type}' (expected ${Object.keys(BUDGETS).join(", ")})`);
  } else if (isIndex && type !== "landing") {
    add("warn", "type", "an _index.md should be type: landing");
  }

  // Budget
  const budget = BUDGETS[type ?? (isIndex ? "landing" : "")];
  if (budget) {
    const [min, max] = budget;
    if (doc.words > max)
      add(
        "warn",
        "budget",
        `${doc.words} words; ${type} budget is ${min}–${max}. Split by job or move detail to reference/concept`,
      );
    if (doc.words < min)
      add(
        "warn",
        "budget",
        `${doc.words} words; under the ${min}-word floor for a ${type}. Merge into the page that owns the topic?`,
      );
  } else if (!isIndex && doc.words < 80) {
    add(
      "warn",
      "fragment",
      `${doc.words} words; likely a fragment from a heading split. Merge it into its owner page`,
    );
  }

  // Title
  if (!doc.title) add("error", "title", "no H1 title");
  if (
    /^(the )?(shape|pieces|tests?|big[- ]\d|deferred|not yet|is it on\??|the 2x2|overview|introduction)$/i.test(
      doc.title.replace(/\s*\/.*$/, ""),
    )
  ) {
    add(
      "warn",
      "title",
      `'${doc.title}' only makes sense under a parent heading; title the page for the reader's job`,
    );
  }
  if (type === "how-to" && /^(the|a|an)\s/i.test(doc.title)) {
    add(
      "warn",
      "title",
      "how-to titles start with a verb ('Filter records', not 'The records table')",
    );
  }

  // Storyline. The last page in its folder's running order has nowhere next
  // to point, so it is exempt.
  if (
    (type === "how-to" || type === "tutorial") &&
    !isLastInOrder(file) &&
    !/^\s*(Next:|## What you built)/m.test(doc.body)
  ) {
    add("warn", "storyline", "no 'Next:' link (how-to) or 'What you built' section (tutorial)");
  }
  if (type === "how-to" && !/^\s*1\.\s/m.test(doc.body)) {
    add("warn", "steps", "how-to without numbered steps; is it really a concept or reference?");
  }
  if (isIndex || type === "landing") {
    doc.proseLines.forEach((l, i) => {
      if (/^\s*[-*]\s+\*{0,2}\[[^\]]+\]\([^)]+\)\*{0,2}\s*$/.test(l)) {
        add(
          "warn",
          "landing",
          "contents link with no annotation; say when the reader needs it",
          i + 1,
        );
      }
    });
  } else {
    const index = path.join(path.dirname(file), "_index.md");
    if (
      fs.existsSync(index) &&
      !fs.readFileSync(index, "utf-8").includes(`(${path.basename(file)}`)
    ) {
      add(
        isNew ? "warn" : "info",
        "orphan",
        "not linked from its folder's _index.md, so it falls out of the running order",
      );
    }
  }

  // Prose
  doc.proseLines.forEach((line, i) => {
    if (line.trim().startsWith("|")) return;
    for (const [re, msg] of BANNED) if (re.test(line)) add("warn", "style", msg, i + 1);
    if (USER_FACING.includes(section) || /\/docs\/use\//.test(rel)) {
      for (const [re, msg] of JARGON) if (re.test(line)) add("warn", "jargon", msg, i + 1);
    }
  });

  return { rel, section, type: type ?? null, words: doc.words, title: doc.title, findings };
}

// ── output ─────────────────────────────────────────────────────────────────

const files = (targets.length ? targets : defaultTargets()).flatMap((t) => walk(t));
const results = files.map(lint);
const all = results.flatMap((r) => r.findings);

if (JSON_OUT) {
  console.log(JSON.stringify(results, null, 2));
} else if (REPORT) {
  const byFolder = new Map();
  for (const r of results) {
    const folder = path.posix.dirname(r.rel);
    const f = byFolder.get(folder) ?? { pages: 0, words: 0, untyped: 0, fragments: 0, warn: 0 };
    f.pages++;
    f.words += r.words;
    if (!r.type) f.untyped++;
    if (
      r.findings.some((x) => x.rule === "fragment" || (x.rule === "budget" && /under/.test(x.msg)))
    )
      f.fragments++;
    f.warn += r.findings.filter((x) => x.level !== "info").length;
    byFolder.set(folder, f);
  }
  const rows = [...byFolder].sort(([a], [b]) => a.localeCompare(b));
  console.log("| Folder | Pages | Words | Avg | Untyped | Fragments | Findings |");
  console.log("|---|---:|---:|---:|---:|---:|---:|");
  for (const [folder, f] of rows) {
    console.log(
      `| ${folder} | ${f.pages} | ${f.words} | ${Math.round(f.words / f.pages)} | ${f.untyped} | ${f.fragments} | ${f.warn} |`,
    );
  }
  const tot = rows.reduce((a, [, f]) => ({ p: a.p + f.pages, w: a.w + f.words }), { p: 0, w: 0 });
  console.log(`\n${tot.p} pages, ${tot.w} words. Rule counts:`);
  const byRule = {};
  for (const x of all) if (x.level !== "info") byRule[x.rule] = (byRule[x.rule] ?? 0) + 1;
  for (const [rule, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1]))
    console.log(`  ${rule}: ${n}`);
} else {
  for (const r of results) {
    const shown = r.findings.filter((x) => x.level !== "info" || targets.length);
    if (!shown.length) continue;
    console.log(`\n${r.rel}  (${r.type ?? "untyped"}, ${r.words} words)`);
    for (const x of shown)
      console.log(
        `  ${x.level.padEnd(5)} ${x.rule.padEnd(9)} ${x.line ? `L${x.line}: ` : ""}${x.msg}`,
      );
  }
  const errors = all.filter((x) => x.level === "error").length;
  const warns = all.filter((x) => x.level === "warn").length;
  console.log(`\n${results.length} files, ${errors} errors, ${warns} warnings`);
}

process.exit(all.some((x) => x.level === "error") ? 1 : 0);
