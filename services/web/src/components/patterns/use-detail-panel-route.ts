"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * URL-driven state for a table ↔ detail-panel screen. The selected row
 * (and the create-new state) live in a single search param so the panel
 * is deep-linkable and back/forward works: `?<param>=<id>` opens an
 * editor, `?<param>=new` opens the create form, no param closes it.
 *
 * @param basePath the route without the param, e.g. `/projects`
 * @param param    the search-param key, e.g. `"project"`
 *
 * @example
 * const panel = useDetailPanelRoute("/projects", "project")
 * panel.isOpen        // boolean — is the sheet open
 * panel.isCreate      // is it the create form (`?project=new`)
 * panel.selectedId    // the raw param value, or null
 * panel.open(id) / panel.openCreate() / panel.close()
 */
export function useDetailPanelRoute(basePath: string, param: string) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedId = searchParams.get(param);

  const open = useCallback(
    (id: string) => router.push(`${basePath}?${param}=${id}`),
    [router, basePath, param],
  );
  const openCreate = useCallback(
    () => router.push(`${basePath}?${param}=new`),
    [router, basePath, param],
  );
  const close = useCallback(() => router.push(basePath), [router, basePath]);

  return {
    selectedId,
    isOpen: selectedId !== null,
    isCreate: selectedId === "new",
    open,
    openCreate,
    close,
  };
}
