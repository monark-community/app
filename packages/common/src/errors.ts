export class AppError extends Error {
  readonly code: string
  readonly statusCode: number
  readonly cause?: unknown

  constructor(code: string, message: string, statusCode = 500, cause?: unknown) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.statusCode = statusCode
    this.cause = cause
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      "not_found",
      id ? `${resource} not found: ${id}` : `${resource} not found`,
      404,
    )
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super("unauthorized", message, 401)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super("forbidden", message, 403)
  }
}

export class ValidationError extends AppError {
  readonly issues?: unknown

  constructor(message: string, issues?: unknown) {
    super("validation_error", message, 400)
    this.issues = issues
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("conflict", message, 409)
  }
}
