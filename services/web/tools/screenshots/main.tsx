import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import "@/app/globals.css";
import { STORIES } from "./stories";

/**
 * Harness entry. Reads `?story=<name>&theme=<light|dark>` and mounts the
 * matching story inside the i18n provider, with the app's real global
 * stylesheet applied. No Next runtime, no backend.
 */
const params = new URLSearchParams(window.location.search);
const name = params.get("story") ?? Object.keys(STORIES)[0]!;
if (params.get("theme") === "dark") {
  document.documentElement.classList.add("dark");
}

const Story = STORIES[name];

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {Story ? (
        <Story />
      ) : (
        <p style={{ padding: 24 }}>
          Unknown story: <code>{name}</code>. Available: {Object.keys(STORIES).join(", ")}
        </p>
      )}
    </NextIntlClientProvider>
  </StrictMode>,
);
