// Re-export of the shared contrast helpers.
//
// The implementation moved to `@monark/common/color` because the email
// templates need the same calculation and render in the api process,
// where a `services/web` module isn't reachable. This file stays as the
// web-side import path so existing call sites (and their tests) keep
// working, and so the web tree has one obvious place to look.
export { relativeLuminance, pickContrastForeground } from "@monark/common/color";
