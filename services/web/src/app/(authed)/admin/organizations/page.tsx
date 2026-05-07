import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { createServerTrpcClient } from "@/lib/trpc-server"
import { OrganizationsList } from "./organizations-list"

export default async function AdminOrganizationsPage() {
  const t = await getTranslations("admin.organizations")

  // Single-tenant fast path : when the deploy runs in single-tenant
  // mode and exactly one organization exists, the "list" surface is
  // dead weight — there's never going to be a second row. Land the
  // admin straight on the singleton's edit page so the click that's
  // 99% the right one is the only click. The list view is still
  // reachable directly via the URL for inspection or in the rare
  // multi-org-while-single-tenant case (e.g. a flag flip post-launch).
  //
  // We read the singleton id from `bootstrapStatus` rather than
  // `adminList` : the former is a public procedure (the (anon)/(authed)
  // layout gates already call it pre-session) so an unauthenticated
  // server-side tRPC client resolves it cleanly. `adminList` requires
  // an admin token — calling it without one would throw, the catch
  // would swallow the error, and the redirect would silently no-op.
  const api = createServerTrpcClient()
  const status = await api.organizations.bootstrapStatus
    .query()
    .catch(() => null)
  if (
    status?.mode === "single" &&
    status.singletonOrganizationId !== null &&
    status.singletonOrganizationId !== undefined
  ) {
    redirect(`/admin/organizations/${status.singletonOrganizationId}`)
  }

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <OrganizationsList />
    </section>
  )
}
