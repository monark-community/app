import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { WebhookEditor } from "../webhook-editor";

/**
 * Create-endpoint page. Three scopes the operator can land in :
 *
 *   - `?org=<id>` — an explicit org, when a caller passes one.
 *   - `?scope=platform` — sysadmin platform-tier endpoint
 *     (organizationId = null) ; receives every event matching the
 *     subscription regardless of org.
 *   - no params — the usual case ; the bootstrap status carries the
 *     singleton id and we resolve it here.
 *
 * If we can't resolve a scope (no singleton yet, no `?org=` and no
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

  const orgParam = typeof params.org === "string" ? params.org.trim() : "";
  const isPlatform = typeof params.scope === "string" && params.scope === "platform";

  const api = createServerTrpcClient();
  const status = await api.organizations.bootstrapStatus.query().catch(() => null);
  const fallbackOrgId = status?.singletonOrganizationId ?? null;

  let organizationId: string | null;

  if (isPlatform) {
    organizationId = null;
  } else if (orgParam) {
    organizationId = orgParam;
  } else if (fallbackOrgId) {
    organizationId = fallbackOrgId;
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

  return <WebhookEditor mode="create" organizationId={organizationId} />;
}
