import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

// Strip the rendered DOM between tests so a leftover dialog / drawer
// from one test doesn't leak into the next. Testing-library handles
// this automatically when vitest's `globals` is on but the explicit
// hook makes the contract obvious + keeps it working if `globals`
// gets toggled later.
afterEach(() => {
  cleanup()
})
