import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { RoleEditor } from "../../role-editor";

/**
 * Create-role page. The org id arrives via the `?org=` query param
 * from the role manager's "New role" link ; in single-tenant deploys
 * the manager auto-pins the singleton id so the link always carries a
 * value. When the param is missing or empty (manual URL typing,
 * stale link), we render a friendly empty state pointing back to the
 * manager rather than booting the user into a broken form.
 *
 * Replaces the previous create-role modal : a full page is
 * easier to navigate when the permission set is dense and gives the
 * operator the entire viewport for the categories matrix.
 */
export default async function AdminRbacNewRolePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const t = await getTranslations("admin.rbac.editor");
  const orgParam = typeof params.org === "string" ? params.org.trim() : "";

  // Even when the operator types the URL by hand, we want to confirm
  // the org exists before the form opens. Bootstrap status carries the
  // singleton id ; an explicit `?org=` still wins (the manager always
  // sends one).
  const api = createServerTrpcClient();
  const status = await api.organizations.bootstrapStatus.query().catch(() => null);
  const fallbackOrgId = status?.singletonOrganizationId ?? null;

  const orgId = orgParam || fallbackOrgId;

  if (!orgId) {
    return (
      <section className="space-y-4">
        <div>
          <Link
            href="/admin/rbac"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t("back")}
          </Link>
        </div>
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t("missingOrg")}
        </p>
      </section>
    );
  }

  return (
    <section>
      <RoleEditor mode="create" organizationId={orgId} />
    </section>
  );
}
