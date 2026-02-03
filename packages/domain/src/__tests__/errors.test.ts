import { describe, expect, test } from "bun:test";
import { DomainError, NotFoundError, ValidationError } from "../errors";

describe("Domain errors", () => {
  test("NotFoundError exposes code and status", () => {
    const err = new NotFoundError("Agent");
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.status).toBe(404);
    expect(err.message).toContain("Agent");
  });

  test("ValidationError exposes code and status", () => {
    const err = new ValidationError("Missing name");
    expect(err.code).toBe("VALIDATION");
    expect(err.status).toBe(400);
  });
});
