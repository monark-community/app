"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { GlobalSearchDialog } from "./global-search-dialog";

type GlobalSearchContextValue = {
  /** Open the command palette (used by the sidebar trigger). */
  open: () => void;
};

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null);

/**
 * Access the app-wide command palette. Available to any client component
 * rendered under {@link GlobalSearchProvider} — i.e. every authed page,
 * since the provider wraps the `(authed)` layout.
 */
export function useGlobalSearch(): GlobalSearchContextValue {
  const ctx = useContext(GlobalSearchContext);
  if (!ctx) {
    throw new Error("useGlobalSearch must be used within a GlobalSearchProvider");
  }
  return ctx;
}

/**
 * Owns the global command palette : its open state, the app-wide
 * ⌘K / Ctrl+K toggle, and the dialog itself. Mounted once around the
 * authed tree so the shortcut works from any route without each page
 * wiring its own handler, and so the sidebar trigger can open it via
 * {@link useGlobalSearch}.
 */
export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo<GlobalSearchContextValue>(
    () => ({ open: () => setIsOpen(true) }),
    [],
  );

  return (
    <GlobalSearchContext.Provider value={value}>
      {children}
      <GlobalSearchDialog open={isOpen} onOpenChange={setIsOpen} />
    </GlobalSearchContext.Provider>
  );
}
