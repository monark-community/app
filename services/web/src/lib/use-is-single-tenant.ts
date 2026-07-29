"use client";

import { trpc } from "@/lib/trpc";

/**
 * Client-side single-tenant detection. The app carries multi-org logic, but a
 * single-organization deploy shouldn't surface organization-vs-platform scope
 * choices (org pickers, "which org" fields, scope labels). Gate that UI on this.
 *
 * Mirrors the convention already used across the admin surfaces
 * (`status.data?.mode !== "multi"`): treat "not multi" as single, so org-scope
 * UI stays hidden while the status is still loading — avoiding a flash of scope
 * pickers on a single-tenant deploy. React Query dedupes the shared query key,
 * so many callers cost one request.
 */
export function useIsSingleTenant(): boolean {
  const status = trpc.organizations.bootstrapStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  return status.data?.mode !== "multi";
}
