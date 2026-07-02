import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const url = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Standalone Vite config for the screenshot harness. Renders the app's
 * real components in isolation — no Next server, no tRPC, no backend.
 * Next-only modules (`next/link`, `next/navigation`) are aliased to tiny
 * stubs so component imports resolve in a plain browser context ; the
 * app's PostCSS/Tailwind pipeline is reused via `css.postcss`.
 */
export default defineConfig({
  root: url("./"),
  plugins: [react()],
  resolve: {
    alias: {
      "@": url("../../src"),
      "next/link": url("./stubs/next-link.tsx"),
      "next/navigation": url("./stubs/next-navigation.ts"),
      "server-only": url("./stubs/empty.ts"),
    },
  },
  // Reuse the web package's postcss.config.mjs (Tailwind v4).
  css: { postcss: url("../../") },
  server: { port: 5199, strictPort: true },
});
