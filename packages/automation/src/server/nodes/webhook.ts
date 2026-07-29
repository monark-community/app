import { z } from "zod";
import { safeFetch } from "@monark/common/http";
import { defineNode } from "../registry";

const WEBHOOK_TIMEOUT_MS = 10_000;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Call an external URL with an interpolated body. The engine resolves
 * `{{ trigger.* }}` / `{{ nodeId.* }}` tokens in `url` / `body` before this
 * runs. A non-2xx response throws so the run records the failure and retries.
 */
export const webhookNode = defineNode({
  descriptor: {
    kind: "action",
    category: "communication",
    label: "Webhook",
    description: "Send an HTTP request to an external URL.",
    icon: "Webhook",
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    configFields: [
      {
        key: "url",
        label: "URL",
        type: "text",
        required: true,
        placeholder: "https://example.com/hook",
      },
      {
        key: "method",
        label: "Method",
        type: "select",
        options: METHODS.map((m) => ({ value: m, label: m })),
      },
      { key: "body", label: "Body (JSON)", type: "textarea", help: "Sent for POST/PUT/PATCH." },
    ],
  },
  configSchema: z.object({
    url: z.string().min(1),
    method: z.enum(METHODS).default("POST"),
    body: z.string().optional(),
  }),
  execute: async (_ctx, config) => {
    const hasBody = config.method !== "GET" && config.method !== "DELETE" && config.body != null;
    // safeFetch guards the URL (scheme/host) and applies the abort timeout.
    const res = await safeFetch(config.url, {
      method: config.method,
      headers: hasBody ? { "content-type": "application/json" } : undefined,
      body: hasBody ? config.body : undefined,
      timeoutMs: WEBHOOK_TIMEOUT_MS,
    });
    if (!res.ok) {
      throw new Error(`Webhook request to ${config.url} failed with status ${res.status}.`);
    }
    return { status: res.status, ok: res.ok };
  },
});
