import { describe, expect, it } from "vitest"
import { err, isErr, isOk, ok } from "../src/result"

describe("common/result.ok", () => {
  it("wraps a value with `ok: true`", () => {
    const result = ok(42)
    expect(result).toEqual({ ok: true, value: 42 })
  })

  it("preserves complex types", () => {
    const value = { id: "x", nested: [1, 2] }
    const result = ok(value)
    expect(result.ok).toBe(true)
    expect(result.value).toEqual(value)
  })
})

describe("common/result.err", () => {
  it("wraps an error with `ok: false`", () => {
    const error = new Error("boom")
    const result = err(error)
    expect(result).toEqual({ ok: false, error })
  })

  it("accepts non-Error error values (string codes, etc.)", () => {
    const result = err("not_found")
    expect(result.ok).toBe(false)
    expect(result.error).toBe("not_found")
  })
})

describe("common/result.isOk + isErr", () => {
  it("isOk narrows to Ok branch", () => {
    const result = ok("hello")
    expect(isOk(result)).toBe(true)
    expect(isErr(result)).toBe(false)
    if (isOk(result)) {
      // Type narrowing works at compile time ; runtime check is the
      // value access above.
      expect(result.value).toBe("hello")
    }
  })

  it("isErr narrows to Err branch", () => {
    const result = err("nope")
    expect(isErr(result)).toBe(true)
    expect(isOk(result)).toBe(false)
    if (isErr(result)) {
      expect(result.error).toBe("nope")
    }
  })
})
