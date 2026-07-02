"use client";

import DOMPurify from "dompurify";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { htmlToText } from "./rich-text";

/**
 * Read-only renderer for a rich-text field value. Sanitizes the stored
 * HTML with DOMPurify on the client before injecting it. During SSR and
 * the first paint it renders a safe plain-text fallback (never
 * unsanitized HTML), then swaps in the sanitized rich version after
 * hydration. Style the output via the shared `.rich-text-content` rules.
 */
export function RichTextView({ html, className }: { html: string; className?: string }) {
  const [clean, setClean] = useState<string | null>(null);

  useEffect(() => {
    setClean(DOMPurify.sanitize(html));
  }, [html]);

  if (clean === null) {
    return <div className={cn("rich-text-content", className)}>{htmlToText(html)}</div>;
  }

  return (
    <div
      className={cn("rich-text-content", className)}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
