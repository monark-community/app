"use client"

import { useLocale } from "next-intl"
import { Laptop, Smartphone, Tablet, Trash2, Tv, Watch } from "lucide-react"
import { Button } from "@/components/ui/button"

// Local component; proving the shape under two consumers (/account + dev
// overlay) before lifting to the @monark/ui registry as `trusted-device-card`.
// Intentionally kept schema-agnostic: the caller passes already-formatted
// primitives, not our Prisma TrustedDevice row, so this is portable.

type DeviceKind = "desktop" | "mobile" | "tablet" | "tv" | "wearable" | "unknown"

export type TrustedDeviceCardProps = {
  label: string
  userAgent?: string | null
  /**
   * ua-parser-js `device.type` — "mobile" | "tablet" | "console" |
   * "smarttv" | "wearable" | "embedded" | "xr" | undefined. Empty for
   * desktop browsers. Used for the glyph picker ; falls back to a UA
   * sniff when absent (older rows that predate this field).
   */
  deviceType?: string | null
  /** Manufacturer / OEM, e.g. "Apple", "Samsung", "Google". Often null on desktop. */
  deviceVendor?: string | null
  /** Model name, e.g. "Pixel 7", "iPhone", "SM-A546B". Often null on desktop. */
  deviceModel?: string | null
  lastSeenAt: Date | string
  lastSeenIp?: string | null
  country?: string | null
  firstSeenAt?: Date | string | null
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
    location: string
    localDev: string
    device: string
    totpVerified: string
    current: string
  }>
}

// Picks the kind from the parser-derived `deviceType` first ; falls back
// to a UA sniff for older rows that were inserted before we surfaced
// device.type. Maps ua-parser-js's enum onto our smaller glyph set
// (console / embedded / xr collapse into "unknown" → laptop glyph).
function detectKind(
  deviceType: string | null | undefined,
  userAgent: string | null | undefined,
): DeviceKind {
  if (deviceType === "mobile") return "mobile"
  if (deviceType === "tablet") return "tablet"
  if (deviceType === "smarttv") return "tv"
  if (deviceType === "wearable") return "wearable"
  if (deviceType) return "unknown"
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
  if (kind === "tv") return <Tv className={className} aria-hidden />
  if (kind === "wearable") return <Watch className={className} aria-hidden />
  return <Laptop className={className} aria-hidden />
}

// Formats with the next-intl-resolved locale rather than the runtime
// default ; otherwise a French-preferences user sees English-formatted
// dates, which is the bug this exists to dodge. Falls back gracefully
// if the locale string isn't recognised by Intl (toLocaleString accepts
// an array — undefined gets the runtime default as a last resort).
function formatRelative(value: Date | string, locale: string): string {
  const date = typeof value === "string" ? new Date(value) : value
  return date.toLocaleString([locale, "en"], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Joins device fields with a sensible fallback chain : prefer
// "Vendor Model" when both are present, else whichever single one we
// got, else null. Skips redundant repetition (some Apple UAs report
// vendor "Apple" + model "iPhone" — fine, joined).
function deviceLine(vendor?: string | null, model?: string | null): string | null {
  const v = vendor?.trim()
  const m = model?.trim()
  if (v && m) {
    // Avoid "Apple Apple" when the parser duplicates ; rare but cheap to guard.
    if (m.toLowerCase().startsWith(v.toLowerCase())) return m
    return `${v} ${m}`
  }
  return v || m || null
}

export function TrustedDeviceCard({
  label,
  userAgent,
  deviceType,
  deviceVendor,
  deviceModel,
  lastSeenAt,
  lastSeenIp,
  country,
  firstSeenAt,
  isCurrent,
  onRevoke,
  revokeLabel = "Revoke",
  revokePending,
  size = "default",
  labels,
}: TrustedDeviceCardProps) {
  // Drives date formatting via Intl.DateTimeFormat ; without it the
  // card defaults to the runtime locale, which is the browser's
  // setting (e.g. "en-US") rather than the user's app preference.
  const locale = useLocale()
  const kind = detectKind(deviceType, userAgent)
  const padding = size === "compact" ? "p-3" : "p-4"
  const titleSize = size === "compact" ? "text-sm" : "text-base"
  const meta = size === "compact" ? "text-xs" : "text-sm"

  const device = deviceLine(deviceVendor, deviceModel)
  // Detect the "we're running locally + nobody told us a real IP" case so
  // we can render an explicit "Local development" badge instead of an
  // empty / silently-missing Location row. Only kicks in when both the
  // IP and country are absent (loopback IPs are stripped server-side
  // before they reach the row).
  const isDevLocal =
    process.env.NODE_ENV !== "production" && !lastSeenIp && !country
  const localDevLabel = labels?.localDev ?? "Local development"

  const rows: Array<{ label: string; value: React.ReactNode }> = []
  if (device) {
    rows.push({
      label: labels?.device ?? "Device",
      value: device,
    })
  }
  if (firstSeenAt) {
    rows.push({
      label: labels?.firstSeen ?? "First seen",
      value: formatRelative(firstSeenAt, locale),
    })
  }
  rows.push({
    label: labels?.lastSeen ?? "Last seen",
    value: formatRelative(lastSeenAt, locale),
  })
  if (country || lastSeenIp) {
    rows.push({
      label: labels?.location ?? labels?.ip ?? "Location",
      value: [country, lastSeenIp].filter(Boolean).join(" · "),
    })
  } else if (isDevLocal) {
    rows.push({
      label: labels?.location ?? labels?.ip ?? "Location",
      value: (
        <span className="text-muted-foreground italic">{localDevLabel}</span>
      ),
    })
  }

  return (
    <div
      className={`rounded-lg border ${isCurrent ? "border-primary/50 bg-primary/5" : "border-border"
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
            size="icon"
            onClick={onRevoke}
            disabled={revokePending}
            aria-label={revokeLabel}
            title={revokeLabel}
            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  )
}
