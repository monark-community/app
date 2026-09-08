// GitHub REST, called with the machine-account token only.
//
// Deliberately not shelling out to `gh`: `gh` resolves its credential from a
// keyring that may hold a human login. Here the only credential that exists is
// the token named by identity.tokenEnv, so a PR opened through this path is
// always authored by the machine account.
import { token } from "./identity.mjs";

async function api(cfg, method, urlPath, body) {
  const tok = token(cfg);
  if (!tok.ok) throw new Error(tok.reason);
  const host = cfg.identity?.host || "github.com";
  const apiBase = host === "github.com" ? "https://api.github.com" : `https://${host}/api/v3`;
  const res = await fetch(`${apiBase}${urlPath}`, {
    method,
    headers: {
      authorization: `Bearer ${tok.value}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      "user-agent": "agentkit",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const msg = json?.message || text || res.statusText;
    const details = json?.errors
      ? ` (${json.errors.map((e) => e.message || e.code).join("; ")})`
      : "";
    throw new Error(`GitHub ${method} ${urlPath} -> ${res.status}: ${msg}${details}`);
  }
  return json;
}

export async function whoami(cfg) {
  return api(cfg, "GET", "/user");
}

export async function findPr(cfg, repo, head) {
  const owner = repo.split("/")[0];
  const list = await api(
    cfg,
    "GET",
    `/repos/${repo}/pulls?head=${owner}:${encodeURIComponent(head)}&state=open`,
  );
  return Array.isArray(list) && list.length ? list[0] : null;
}

export async function createPr(cfg, repo, { head, base, title, body, draft = true }) {
  const existing = await findPr(cfg, repo, head);
  if (existing) return { ...existing, reused: true };
  const pr = await api(cfg, "POST", `/repos/${repo}/pulls`, { head, base, title, body, draft });
  return { ...pr, reused: false };
}
