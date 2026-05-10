"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { CheckCircle2, Hourglass, Loader2 } from "lucide-react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "../../../../api/src/trpc/router"
import { trpc } from "@/lib/trpc"

// Derive the shape from the tRPC router so `services/web` doesn't
// import from `@monark/*/server` (forbidden by the workspace lint
// rule — server-only modules pull `node:*` dependencies that can't
// reach the browser bundle). Inferring from the router is the
// drift-proof equivalent : every field the api returns lands here
// automatically.
type Status = inferRouterOutputs<AppRouter>["organizations"]["bootstrapStatus"]

type RowPhase = "loading" | "ok" | "stuck"

// Per-row reveal cadence. Each entry is "ms after mount before this row
// stops spinning and shows its real state." Picked by feel : fast enough
// that an operator who knows what they're doing isn't held back, slow
// enough that the boot sequence reads as a sequence rather than a
// snapshot. Reduced-motion users skip the timers and see all rows
// resolved on first paint.
const ROW_DELAYS_MS = [400, 900, 1400] as const

// Tiny grace period after the third row goes green before we forward
// the operator to home. Without it the redirect feels abrupt — they
// don't get the satisfaction of seeing the last check land.
const REDIRECT_GRACE_MS = 600

/**
 * Live status display for /setup. The boot sequence animates in on
 * first paint : each row starts as a spinner, then resolves to either
 * a green check (everything healthy) or an amber hourglass (still
 * stuck on something we know how to fix). The "stuck" guidance with
 * env-var instructions is *only* rendered once the relevant row has
 * resolved AND it's actually stuck — a happy boot never shows config
 * help text.
 *
 * The query keeps polling every 5s so that when the deploy bridge
 * lands the singleton org, the third row flips from amber to green
 * live and we forward to home automatically.
 */
export function SetupStatus({ initialStatus }: { initialStatus: Status | null }) {
  const t = useTranslations("setup")
  const router = useRouter()
  const utils = trpc.useUtils()
  const query = trpc.organizations.bootstrapStatus.useQuery(undefined, {
    initialData: initialStatus ?? undefined,
    refetchOnWindowFocus: false,
    // 5s feels right : fast enough that a freshly-provisioned org
    // unblocks the operator within a single coffee sip, slow enough
    // that the load on Postgres is negligible even on a public
    // /setup page hammered by retry-on-error clients.
    refetchInterval: (q) => (q.state.data?.bootstrapped ? false : 5000),
  })

  // Self-healing recovery : every time the status poll says we're
  // still stuck on org provisioning, kick the API server's bootstrap
  // hook again. The API reads INITIAL_ORG_* server-side, so the empty
  // input here is intentional — passing nothing tells the procedure
  // "use whatever the server already has." Idempotent on the server,
  // so re-firing while a previous attempt is still in flight is safe.
  // Catches the rare race where the boot-time module hook lost to the
  // first incoming request, or where the operator set env vars after
  // the API was already up and a restart hasn't landed yet.
  const ensureBootstrap = trpc.organizations.ensureBootstrap.useMutation({
    onSuccess: (result) => {
      // A successful create flips bootstrapped → true on the next poll ;
      // invalidating now shortens that window from "up to 5s" to "the
      // next event-loop tick".
      if (result.ok && result.created) {
        void utils.organizations.bootstrapStatus.invalidate()
      }
    },
  })
  useEffect(() => {
    if (query.data?.bootstrapped) return
    if (query.data?.mode !== "single") return
    if (ensureBootstrap.isPending) return
    ensureBootstrap.mutate({})
    // Deps intentionally only include status fields ; the mutation
    // object is unstable across renders, and the `isPending` guard
    // above already prevents reentry while a previous attempt is in
    // flight. Re-fires once per status-poll round.
  }, [
    query.data?.bootstrapped,
    query.data?.mode,
    query.data?.organizationCount,
  ])

  // Mount-time bootstrap check : the server-side `redirect("/")` in
  // page.tsx already kicks bootstrapped users out, but if the SSR
  // status fetch failed and the client fetch succeeded with
  // `bootstrapped: true`, we'd otherwise render the boot animation
  // for ~2 seconds before the post-animation redirect finally fires.
  // This guard short-circuits that edge : if the very first read
  // already says we're up, redirect now and don't render anything.
  // Captured in a `useState` initialiser so it doesn't flap if the
  // query later refetches (e.g. focus, even though we disabled it).
  const [skipForBootstrapped] = useState(
    () => initialStatus?.bootstrapped === true,
  )

  const [revealedCount, setRevealedCount] = useState(0)

  // Mount-time redirect : runs once when we already know we're done.
  // Pairs with the early-return below so the user never sees the
  // boot panel for a system that doesn't need to be set up.
  useEffect(() => {
    if (skipForBootstrapped) router.replace("/")
  }, [skipForBootstrapped, router])

  // Stagger the row reveals on mount. Reduced-motion users get the
  // final state immediately — the animation is a UX nicety, not load-
  // bearing for the information.
  useEffect(() => {
    if (skipForBootstrapped) return
    if (typeof window !== "undefined") {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
      if (mq.matches) {
        setRevealedCount(ROW_DELAYS_MS.length)
        return
      }
    }
    const timers = ROW_DELAYS_MS.map((delay, index) =>
      setTimeout(
        () => setRevealedCount((current) => Math.max(current, index + 1)),
        delay,
      ),
    )
    return () => timers.forEach(clearTimeout)
  }, [skipForBootstrapped])

  // When the system finishes bootstrapping (live, while the page is
  // open), forward to home — but only after the staggered reveal has
  // finished, so the user actually sees the third row land green.
  useEffect(() => {
    if (!query.data?.bootstrapped) return
    if (revealedCount < ROW_DELAYS_MS.length) return
    const id = setTimeout(() => router.replace("/"), REDIRECT_GRACE_MS)
    return () => clearTimeout(id)
  }, [query.data?.bootstrapped, revealedCount, router])

  const status: Status = query.data ?? {
    mode: "single",
    bootstrapped: false,
    organizationCount: 0,
    singletonOrganizationId: null,
    singletonDisplayName: null,
    singletonLogoUrl: null,
  }

  // Per-row resolved state, gated by the staggered reveal. Rows still
  // in their loading window stay as `"loading"` regardless of what the
  // query says — keeps the animation coherent even if status flips
  // mid-cadence.
  const stuckOnOrg = status.mode === "single" && status.organizationCount === 0
  const phases: RowPhase[] = [
    revealedCount > 0 ? "ok" : "loading",
    revealedCount > 1 ? "ok" : "loading",
    revealedCount > 2
      ? status.bootstrapped
        ? "ok"
        : "stuck"
      : "loading",
  ]
  const tenancyPhase = phases[2]
  const showStuck = tenancyPhase === "stuck" && stuckOnOrg

  // Already bootstrapped on first read — the mount effect above is
  // already navigating away. Render nothing in the meantime so the
  // boot panel never flashes for a healthy system.
  if (skipForBootstrapped) return null

  return (
    <div className="space-y-4">
      <ul className="space-y-2 rounded-lg border border-border p-4">
        {/*
          Items ordered by deploy lifecycle : services come up, then
          auth, then tenant data. The first two are implicit when the
          server can render this page at all (we wouldn't be here if
          the DB or auth were down) ; we still show them so the
          checklist reads as a complete boot sequence.
        */}
        <StatusRow phase={phases[0]!} label={t("checks.services")} />
        <StatusRow phase={phases[1]!} label={t("checks.auth")} />
        <StatusRow
          phase={tenancyPhase!}
          label={
            status.mode === "multi"
              ? t("checks.tenancyMulti")
              : t("checks.tenancySingle")
          }
          detail={
            status.mode === "single"
              ? t("checks.orgCount", { count: status.organizationCount })
              : undefined
          }
        />
      </ul>

      {showStuck && (
        <div
          // tailwindcss-animate utilities (already used by Dialog,
          // Popover, etc.) ; the panel slides + fades in once the
          // tenancy row resolves stuck so the config help text doesn't
          // pop into existence flat.
          className="space-y-3 rounded-lg border border-amber-400/40 bg-amber-400/5 p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
        >
          <h2 className="text-sm font-semibold text-amber-500">
            {t("stuck.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("stuck.subtitle")}</p>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="font-medium">{t("stuck.envHeading")}</p>
            <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-[11px] leading-relaxed">
{`INITIAL_ORG_SLUG=acme
INITIAL_ORG_NAME="Acme Corporation"
INITIAL_ORG_PRIMARY_COLOR=#F0870C   # optional`}
            </pre>
            <p>{t("stuck.restartHint")}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusRow({
  phase,
  label,
  detail,
}: {
  phase: RowPhase
  label: string
  detail?: string
}) {
  return (
    <li className="flex items-start gap-3 text-sm">
      <span
        aria-hidden
        className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center"
      >
        {phase === "loading" && (
          <Loader2 className="h-4 w-4 text-muted-foreground motion-safe:animate-spin" />
        )}
        {phase === "ok" && (
          // `key` forces the icon to re-mount when phase flips so the
          // zoom-in plays on every transition (loading → ok or
          // stuck → ok) rather than only the first paint.
          <CheckCircle2
            key="ok"
            className="h-4 w-4 text-emerald-500 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200"
          />
        )}
        {phase === "stuck" && (
          <Hourglass
            key="stuck"
            className="h-4 w-4 text-amber-500 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200"
          />
        )}
      </span>
      <span className="flex-1">
        <span
          className={
            phase === "loading" ? "text-muted-foreground" : "text-foreground"
          }
        >
          {label}
        </span>
        {detail && (
          <span className="ml-2 text-xs text-muted-foreground">{detail}</span>
        )}
      </span>
    </li>
  )
}
