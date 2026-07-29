import type { ImgHTMLAttributes } from "react";

/** Minimal `next/image` stand-in for the harness: a plain <img>. Avoids
 *  next/image's `process`/loader machinery, which isn't defined here. */
export default function Image({
  src,
  alt = "",
  width,
  height,
  ...rest
}: ImgHTMLAttributes<HTMLImageElement> & { src?: string }) {
  return (
    <img
      src={typeof src === "string" ? src : ""}
      alt={alt}
      width={width}
      height={height}
      {...rest}
    />
  );
}
