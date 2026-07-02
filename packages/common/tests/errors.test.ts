import { describe, expect, it } from "vitest";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../src/errors";

describe("common/errors.AppError", () => {
  it("carries a code, status, and message", () => {
    const err = new AppError("custom_code", "boom", 418);
    expect(err.code).toBe("custom_code");
    expect(err.message).toBe("boom");
    expect(err.statusCode).toBe(418);
  });

  it("defaults statusCode to 500 when omitted", () => {
    const err = new AppError("oops", "fell over");
    expect(err.statusCode).toBe(500);
  });

  it("preserves an optional cause for re-throw chains", () => {
    const inner = new Error("inner");
    const err = new AppError("wrapped", "outer", 500, inner);
    expect(err.cause).toBe(inner);
  });

  it("sets `name` to the constructor name so logs read cleanly", () => {
    const err = new AppError("x", "y");
    expect(err.name).toBe("AppError");
  });

  it("is a real Error subclass — `instanceof Error` works", () => {
    const err = new AppError("x", "y");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("common/errors.NotFoundError", () => {
  it("formats `Resource not found: id` when an id is given", () => {
    const err = new NotFoundError("User", "abc-123");
    expect(err.message).toBe("User not found: abc-123");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("not_found");
  });

  it("falls back to `Resource not found` when no id is supplied", () => {
    const err = new NotFoundError("Organization");
    expect(err.message).toBe("Organization not found");
  });

  it("is an `instanceof AppError`", () => {
    const err = new NotFoundError("User", "1");
    expect(err).toBeInstanceOf(AppError);
  });
});

describe("common/errors.UnauthorizedError", () => {
  it("defaults the message to 'Unauthorized'", () => {
    const err = new UnauthorizedError();
    expect(err.message).toBe("Unauthorized");
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("unauthorized");
  });

  it("accepts a custom message", () => {
    const err = new UnauthorizedError("Bad token");
    expect(err.message).toBe("Bad token");
  });
});

describe("common/errors.ForbiddenError", () => {
  it("defaults the message to 'Forbidden'", () => {
    const err = new ForbiddenError();
    expect(err.message).toBe("Forbidden");
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("forbidden");
  });

  it("accepts a custom message", () => {
    const err = new ForbiddenError("Admin only");
    expect(err.message).toBe("Admin only");
  });
});

describe("common/errors.ValidationError", () => {
  it("returns a 400 with a `validation_error` code", () => {
    const err = new ValidationError("invalid input");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("validation_error");
  });

  it("preserves the optional `issues` payload (e.g. zod errors)", () => {
    const issues = [{ path: ["email"], message: "Invalid email" }];
    const err = new ValidationError("validation failed", issues);
    expect(err.issues).toEqual(issues);
  });
});

describe("common/errors.ConflictError", () => {
  it("returns a 409 with a `conflict` code", () => {
    const err = new ConflictError("slug already in use");
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("conflict");
    expect(err.message).toBe("slug already in use");
  });
});
