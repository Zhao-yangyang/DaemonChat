export type ErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "INFRA"
  | "NOT_IMPLEMENTED";

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super("NOT_FOUND", message, 404);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message: string) {
    super("FORBIDDEN", message, 403);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super("VALIDATION", message, 400);
  }
}

export class RateLimitedError extends DomainError {
  constructor(message: string) {
    super("RATE_LIMITED", message, 429);
  }
}

export class InfraError extends DomainError {
  constructor(message: string) {
    super("INFRA", message, 500);
  }
}

export class NotImplementedError extends DomainError {
  constructor(message: string) {
    super("NOT_IMPLEMENTED", message, 501);
  }
}
