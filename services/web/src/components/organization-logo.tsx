import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md" | "lg";

const SIZE_CLASSES: Record<Size, { box: string; icon: string }> = {
  // 28px slot for the AppBar logo. Replaces the static brand mark with
  // the active org's logo (or an empty-square placeholder until one's
  // been uploaded). Smaller corner radius than `sm` so the shape reads
  // as "tight square" alongside the menu hamburger + breadcrumb.
  xs: { box: "h-7 w-7 rounded-sm", icon: "h-3.5 w-3.5" },
  // Drop-in for the 40px row icon used in lists. Logo is square + clipped to
  // a small radius ; matches the visual rhythm of the list rows.
  sm: { box: "h-10 w-10 rounded-md", icon: "h-4 w-4" },
  // 64px is the org-card / member-row default. Big enough for the logo to
  // read at a glance without dominating its row.
  md: { box: "h-16 w-16 rounded-md", icon: "h-7 w-7" },
  // 80px headline size on the detail page, paired with `OrganizationLogoEditor`.
  lg: { box: "h-20 w-20 rounded-lg", icon: "h-8 w-8" },
};

/**
 * Square display surface for an Organization's logo. Purpose-built for
 * the org case so we don't have to override `Avatar`'s circular shape ;
 * the empty-state fallback is a `Building2` glyph on a neutral muted
 * background (no brand-orange gradient — that affordance belongs to
 * user identities, not orgs).
 *
 * Pure presentational ; the editor wrapper handles upload + remove.
 * Pass `logoUrl` already host-rewritten if you need LAN-from-phone
 * resolution (the list / detail surfaces do this at the call site).
 */
export function OrganizationLogo({
  logoUrl,
  size = "md",
  alt = "",
  className,
}: {
  logoUrl: string | null | undefined;
  size?: Size;
  alt?: string;
  className?: string;
}) {
  const sizeClasses = SIZE_CLASSES[size];
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-muted text-muted-foreground",
        sizeClasses.box,
        className,
      )}
    >
      {logoUrl ? (
        <img src={logoUrl} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <Building2 className={sizeClasses.icon} aria-hidden />
      )}
    </span>
  );
}
