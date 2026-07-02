import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../src/errors";
import { APP_TO_TRPC_CODE } from "../src/trpc";

// `translateAppError` middleware reads `APP_TO_TRPC_CODE[err.code]`
// when an AppError reaches it. Locking in the mapping table here
// catches "added a new domain error class but forgot to register
// the tRPC code mapping" — the failure mode that turns what should
// be a 404 into INTERNAL_SERVER_ERROR. Every domain error class's
// constructor passes a static string code into AppError ; we
// instantiate one of each + look the code up to assert the mapping
// is round-trip correct.
//
// We deliberately don't test the middleware via a real tRPC caller
// here — vite-node's per-relative-path module caching causes the
// `instanceof AppError` check inside the middleware to fail across
// the test/source boundary, even though production goes through a
// single resolved path and works correctly. The integration suites
// across the workspace exercise the full pipeline through real
// tRPC procedures throwing AppError types.

describe("common/trpc APP_TO_TRPC_CODE mapping", () => {
  it("NotFoundError code maps to NOT_FOUND", () => {
    const err = new NotFoundError("Widget", "abc");
    expect(APP_TO_TRPC_CODE[err.code]).toBe("NOT_FOUND");
  });

  it("UnauthorizedError code maps to UNAUTHORIZED", () => {
    const err = new UnauthorizedError();
    expect(APP_TO_TRPC_CODE[err.code]).toBe("UNAUTHORIZED");
  });

  it("ForbiddenError code maps to FORBIDDEN", () => {
    const err = new ForbiddenError();
    expect(APP_TO_TRPC_CODE[err.code]).toBe("FORBIDDEN");
  });

  it("ValidationError code maps to BAD_REQUEST", () => {
    const err = new ValidationError("bad input");
    expect(APP_TO_TRPC_CODE[err.code]).toBe("BAD_REQUEST");
  });

  it("ConflictError code maps to CONFLICT", () => {
    const err = new ConflictError("dup");
    expect(APP_TO_TRPC_CODE[err.code]).toBe("CONFLICT");
  });

  it("an unknown domain code returns undefined (middleware falls back to INTERNAL_SERVER_ERROR)", () => {
    expect(APP_TO_TRPC_CODE["never_registered"]).toBeUndefined();
  });

  it("the mapping table covers every code emitted by the domain error classes", () => {
    // Snapshot-style guard : any new AppError subclass that adds a
    // new `code` string MUST land here and a matching tRPC code in
    // APP_TO_TRPC_CODE. The `unknown` test above confirms the
    // middleware's fallback ; this confirms we don't accidentally
    // ship a domain error whose code isn't on the map.
    const knownDomainCodes = [
      new NotFoundError("X").code,
      new UnauthorizedError().code,
      new ForbiddenError().code,
      new ValidationError("x").code,
      new ConflictError("x").code,
    ];
    for (const code of knownDomainCodes) {
      expect(APP_TO_TRPC_CODE[code]).toBeDefined();
    }
  });
});
