import Image from "next/image"

export function MonarkLogo({
  className,
  size = 48,
}: {
  className?: string
  size?: number
}) {
  return (
    <Image
      src="/monark-logo.svg"
      alt="Monark"
      width={size}
      height={size}
      priority
      className={className}
    />
  )
}
