"use client";

import { useEffect } from "react";

/**
 * Root error boundary of last resort. Catches errors thrown by the root
 * layout itself (where the segment `(authed)/error.tsx` can't reach) and must
 * render its own <html>/<body> because it replaces the root layout entirely.
 *
 * i18n and the shared theme/CSS are unavailable here by design — this boundary
 * exists outside the locale provider — so the copy is intentionally plain
 * English with inline styles. It is the rare, documented exception to the
 * "all user-facing strings go through i18n" rule.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#fafafa",
          color: "#18181b",
        }}
      >
        <div style={{ maxWidth: 360, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#52525b", margin: "0 0 20px" }}>
            An unexpected error occurred. Please try again.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              fontSize: 14,
              fontWeight: 500,
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #d4d4d8",
              background: "#ffffff",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
