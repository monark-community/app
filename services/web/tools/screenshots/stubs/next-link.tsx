import { forwardRef, type AnchorHTMLAttributes } from "react";

/** Minimal `next/link` stand-in for the harness: a plain anchor. */
const Link = forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string | { pathname?: string } }
>(function Link({ href, children, ...props }, ref) {
  const url = typeof href === "string" ? href : (href?.pathname ?? "#");
  return (
    <a ref={ref} href={url} {...props}>
      {children}
    </a>
  );
});

export default Link;
