// Runtime config for the Monark MCP server, read from the environment an MCP
// host (Claude Desktop, Cursor, …) passes in. Kept tiny + pure so it's trivial
// to construct in tests.

export interface MonarkConfig {
  /** The Monark deployment origin, e.g. `https://app.example.com` (no /api/v1). */
  apiUrl: string;
  /** An `mrk_` API key from Account → API keys. The server acts as this key. */
  apiKey: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): MonarkConfig {
  const apiUrl = (env.MONARK_API_URL ?? "").trim().replace(/\/+$/, "");
  const apiKey = (env.MONARK_API_KEY ?? "").trim();
  if (!apiUrl) {
    throw new Error(
      "MONARK_API_URL is required — your Monark host, e.g. https://app.example.com (without /api/v1).",
    );
  }
  if (!apiKey) {
    throw new Error(
      "MONARK_API_KEY is required — an `mrk_` API key created at Account → API keys.",
    );
  }
  return { apiUrl, apiKey };
}
