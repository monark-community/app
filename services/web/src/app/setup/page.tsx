import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { SetupStatus } from "./setup-status";

// `/setup` is the only route that must remain reachable while the
// system is not yet bootstrapped (single-tenant deploys without an
// initial organization). Both (anon) and (authed) layouts redirect
// here when their bootstrap gate fails ; this page is intentionally
// outside both groups so the redirect doesn't loop.
//
// When the system *is* bootstrapped, hitting /setup directly would be
// a dead end for the user, so we forward to home. This matches the
// behaviour of "first-run wizards" elsewhere — visible only when
// applicable.
export default async function SetupPage() {
  const t = await getTranslations("setup");
  // Public tRPC procedure ; no auth needed since the gate that brings
  // users here also runs without a session.
  const api = createServerTrpcClient();
  const status = await api.organizations.bootstrapStatus.query().catch(() => null);

  if (status?.bootstrapped) {
    // System is already up. Don't keep showing the boot screen.
    redirect("/");
  }

  return (
    // Top-anchored layout (vs `justify-center`) so the panel grows
    // downward only when the stuck-guidance reveals — vertical
    // centering would re-center the whole block and push the header
    // upward, which reads as a layout shift. `pt-24` matches the
    // visual rhythm of the rest of the auth pages without committing
    // to an absolute pixel value the design system might rotate.
    <main className="mx-auto w-full max-w-xl px-6 pb-12 pt-24 sm:pt-32">
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("eyebrow")}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </header>

        {/*
          The status checklist + the "stuck on org" guidance live in a
          client component so the page can poll for state and re-render
          live without a full reload. The server-rendered initial state
          comes from the same query so the first paint is already
          accurate ; no flash of "checking…".
        */}
        <SetupStatus initialStatus={status ?? null} />
      </div>
    </main>
  );
}
