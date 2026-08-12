import { z } from "zod";
import { ValidationError } from "@monark/common";
import type { InAppTool } from "./tools";

// Navigation tools for the assistant. Unlike every other tool, navigation is a
// CLIENT action — the server can't move the user's browser. So `navigate` has no
// server side-effect: it only validates + resolves a target and returns
// { url, label }; the web thread renders a "Go to {label}" button, and the
// user's click performs the actual router.push (the click IS the confirmation).
//
// Safety: a target must be an in-app RELATIVE path under a known section prefix —
// never an external or protocol URL — so the model can't send the user off-app.

// Top-level sections (mirrors the web PRIMARY_NAV; kept minimal + stable here
// since services/api can't import the web config). Deep-links to specific
// entities aren't enumerated — they're validated by the prefix allowlist below.
const SECTIONS = [
  { path: "/", label: "Home", description: "The app home." },
  { path: "/calendar", label: "Calendar", description: "Calendars and events." },
  { path: "/kanban", label: "Kanban", description: "Boards, columns, and cards." },
  { path: "/data", label: "Data", description: "Data Models and their records." },
  { path: "/wiki", label: "Wiki", description: "The knowledge base (nested pages)." },
  { path: "/automation", label: "Automations", description: "Automation flows." },
  { path: "/admin", label: "Admin", description: "Org administration (users, roles, settings)." },
  { path: "/account", label: "Account", description: "Your profile, security, and notifications." },
];

// In-app route prefixes a navigation target must fall under.
const ALLOWED_PREFIXES = [
  "/calendar",
  "/kanban",
  "/data",
  "/wiki",
  "/automation",
  "/admin",
  "/account",
];

// Validate a navigation target is a safe, in-app relative path. Returns the
// normalized url or throws a ValidationError the model can react to.
export function validateAppPath(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    throw new ValidationError(
      "Navigation targets must be in-app relative paths starting with '/'.",
    );
  }
  const path = trimmed.split(/[?#]/)[0] ?? "";
  // Reject anything that looks like a scheme (http:, javascript:, …).
  if (/:/.test(path)) {
    throw new ValidationError("External or protocol URLs are not allowed.");
  }
  const ok = path === "/" || ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  if (!ok) {
    throw new ValidationError(`"${path}" is not a navigable app section.`);
  }
  return trimmed;
}

export const navTools: InAppTool[] = [
  {
    name: "list_destinations",
    description:
      "List the app's top-level sections you can send the user to (path + what's there). Use to pick a valid section; for a specific record, wiki page, or board, look up its id with the relevant tool and build its path (e.g. /wiki/<id>, /data/models/<key>?record=<id>).",
    mutates: false,
    inputSchema: z.object({}),
    run: async () => SECTIONS,
  },
  {
    name: "navigate",
    description:
      'Offer to take the user to an in-app page. Provide a relative `url` (e.g. "/wiki/<id>", "/data/models/tasks?record=<id>", "/kanban") and a short human `label` (e.g. "the Q3 Roadmap page"). This does NOT navigate immediately — it shows the user a "Go to {label}" button they click to go. Only in-app paths are allowed.',
    mutates: false,
    inputSchema: z.object({
      url: z.string().min(1).max(500),
      label: z.string().trim().min(1).max(80),
    }),
    run: async (_caller, input) => {
      const p = input as { url: string; label: string };
      return { url: validateAppPath(p.url), label: p.label };
    },
  },
];
