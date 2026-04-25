"use client"

import { Laptop, ShieldCheck, Smartphone, Tablet } from "lucide-react"
import { Button } from "@/components/ui/button"

// Local component; proving the shape under two consumers (/account + dev
// overlay) before lifting to the @monark/ui registry as `trusted-device-card`.
// Intentionally kept schema-agnostic: the caller passes already-formatted
// primitives, not our Prisma TrustedDevice row, so this is portable.

type DeviceKind = "desktop" | "mobile" | "tablet" | "unknown"

export type TrustedDeviceCardProps = {
  label: string
  userAgent?: string | null
  lastSeenAt: Date | string
  lastSeenIp?: string | null
  country?: string | null
  firstSeenAt?: Date | string | null
  totpVerifiedAt?: Date | string | null
  isCurrent?: boolean
  // When provided, renders a destructive "Revoke" action on the card.
  onRevoke?: () => void
  revokeLabel?: string
  revokePending?: boolean
  // "default" for the full card; "compact" for tighter surfaces like the
  // dev overlay.
  size?: "default" | "compact"
  // Localized field labels; keeps the card free of i18n plumbing.
  labels?: Partial<{
    firstSeen: string
    lastSeen: string
    ip: string
    country: string
    totpVerified: string
    current: string
  }>
}

function detectKind(userAgent: string | null | undefined): DeviceKind {
  if (!userAgent) return "unknown"
  const ua = userAgent.toLowerCase()
  if (/ipad|tablet/.test(ua)) return "tablet"
  if (/iphone|android|mobile/.test(ua)) return "mobile"
  return "desktop"
}

function Glyph({ kind }: { kind: DeviceKind }) {
  const className = "h-5 w-5"
  if (kind === "mobile") return <Smartphone className={className} aria-hidden />
  if (kind === "tablet") return <Tablet className={className} aria-hidden />
  return <Laptop className={className} aria-hidden />
}

function formatRelative(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function TrustedDeviceCard({
  label,
  userAgent,
  lastSeenAt,
  lastSeenIp,
  country,
  firstSeenAt,
  totpVerifiedAt,
  isCurrent,
  onRevoke,
  revokeLabel = "Revoke",
  revokePending,
  size = "default",
  labels,
}: TrustedDeviceCardProps) {
  const kind = detectKind(userAgent)
  const padding = size === "compact" ? "p-3" : "p-4"
  const titleSize = size === "compact" ? "text-sm" : "text-base"
  const meta = size === "compact" ? "text-xs" : "text-sm"

  const rows: Array<{ label: string; value: React.ReactNode }> = []
  if (firstSeenAt) {
    rows.push({
      label: labels?.firstSeen ?? "First seen",
      value: formatRelative(firstSeenAt),
    })
  }
  rows.push({
    label: labels?.lastSeen ?? "Last seen",
    value: formatRelative(lastSeenAt),
  })
  if (country || lastSeenIp) {
    rows.push({
      label: labels?.ip ?? "Location",
      value: [country, lastSeenIp].filter(Boolean).join(" · "),
    })
  }

  return (
    <div
      className={`rounded-lg border ${
        isCurrent ? "border-primary/50 bg-primary/5" : "border-border"
      } ${padding}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground">
          <Glyph kind={kind} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`truncate font-medium ${titleSize}`}>{label}</p>
            {isCurrent && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                {labels?.current ?? "This device"}
              </span>
            )}
            {totpVerifiedAt && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                title={labels?.totpVerified ?? "TOTP verified"}
              >
                <ShieldCheck className="h-3 w-3" aria-hidden />
                {labels?.totpVerified ?? "TOTP verified"}
              </span>
            )}
          </div>
          <dl
            className={`mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 ${meta} text-muted-foreground`}
          >
            {rows.map((row) => (
              <div key={row.label} className="contents">
                <dt>{row.label}</dt>
                <dd className="truncate text-foreground/80">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        {onRevoke && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRevoke}
            disabled={revokePending}
            className="text-destructive hover:text-destructive"
          >
            {revokeLabel}
          </Button>
        )}
      </div>
    </div>
  )
}
