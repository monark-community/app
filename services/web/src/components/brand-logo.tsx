import Image from "next/image"
import { BRANDING } from "@monark/branding"

// Brand logo. Source path + alt text both flow from `@monark/branding`
// so a downstream team retargets the starter by editing one config
// (drop a new SVG into `public/`, point `BRANDING.logoSrc` at it).
// Used in the app bar, sign-in / sign-up screens, the TOTP step, and
// the not-found page ; the props mirror the original `MonarkLogo`
// surface so call sites only changed import + name.
export function BrandLogo({
  className,
  size = 48,
}: {
  className?: string
  size?: number
}) {
  return (
    <Image
      src={BRANDING.logoSrc}
      alt={BRANDING.appName}
      width={size}
      height={size}
      priority
      className={className}
    />
  )
}
