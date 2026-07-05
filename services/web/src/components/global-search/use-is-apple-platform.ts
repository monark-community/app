"use client";

import { useEffect, useState } from "react";

/**
 * Whether the client is an Apple platform, resolved after mount so SSR and
 * the first client render agree (both `false`) and there's no hydration
 * mismatch. Drives the ⌘ vs Ctrl shortcut glyph.
 */
export function useIsApplePlatform(): boolean {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(/mac|iphone|ipad|ipod/i.test(navigator.userAgent));
  }, []);
  return isMac;
}
