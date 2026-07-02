import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { WebhookEditor } from "../webhook-editor";

/**
 * Create-endpoint page. Three scopes the operator can land in :
 *
 *   - `?org=<id>` — multi-tenant ; the manager passes the picked org.
 *   - `?scope=platform` — sysadmin platform-tier endpoint
 *     (organizationId = null) ; receives every event matching the
 *     subscription regardless of org.
 *   - no params — only valid in single-tenant deploys, where the
 *     bootstrap status carries the singleton id ; we resolve it here.
 *
 * If we can't resolve a scope (multi-tenant with no `?org=` and no
 * platform flag), render an empty state pointing back to the manager
 * rather than booting the operator into a broken form.
 */
export default async function AdminWebhookNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const t = await getTranslations("admin.webhooks.editor");
  const tManager = await getTranslations("admin.webhooks.manager");

  const orgParam = typeof params.org === "string" ? params.org.trim() : "";
  const isPlatform = typeof params.scope === "string" && params.scope === "platform";

  const api = createServerTrpcClient();
  const status = await api.organizations.bootstrapStatus.query().catch(() => null);
  const fallbackOrgId =
    status?.mode !== "multi" && status?.singletonOrganizationId
      ? status.singletonOrganizationId
      : null;

  let organizationId: string | null;
  let scopeLabel: string;

  if (isPlatform) {
    organizationId = null;
    scopeLabel = tManager("orgPicker.platform");
  } else if (orgParam) {
    organizationId = orgParam;
    scopeLabel = t("orgScopeOrg");
  } else if (fallbackOrgId) {
    organizationId = fallbackOrgId;
    scopeLabel = t("orgScopeOrg");
  } else {
    return (
      <section className="space-y-4">
        <Link
          href="/admin/webhooks"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("back")}
        </Link>
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t("missingScope")}
        </p>
      </section>
    );
  }

  return <WebhookEditor mode="create" organizationId={organizationId} scopeLabel={scopeLabel} />;
}
