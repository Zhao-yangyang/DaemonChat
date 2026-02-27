import { describe, expect, test } from "bun:test";
import { calculateRetryDelayMs, resolveRetryState } from "./retry";

describe("worker retry helpers", () => {
  test("calculateRetryDelayMs applies exponential backoff and cap", () => {
    expect(
      calculateRetryDelayMs({
        attempt: 1,
        baseDelayMs: 5000,
        maxDelayMs: 120000,
      })
    ).toBe(5000);

    expect(
      calculateRetryDelayMs({
        attempt: 3,
        baseDelayMs: 5000,
        maxDelayMs: 120000,
      })
    ).toBe(20000);

    expect(
      calculateRetryDelayMs({
        attempt: 10,
        baseDelayMs: 5000,
        maxDelayMs: 120000,
      })
    ).toBe(120000);
  });

  test("resolveRetryState schedules retry when max attempts not reached", () => {
    const now = Date.parse("2026-02-26T00:00:00.000Z");
    const state = resolveRetryState({
      currentAttempts: 1,
      maxAttempts: 5,
      baseDelayMs: 5000,
      maxDelayMs: 120000,
      nowMs: now,
    });

    expect(state.attempts).toBe(2);
    expect(state.shouldDeadLetter).toBe(false);
    expect(state.retryDelayMs).toBe(10000);
    expect(state.runAtIso).toBe("2026-02-26T00:00:10.000Z");
  });

  test("resolveRetryState dead-letters when attempts reach max", () => {
    const now = Date.parse("2026-02-26T00:00:00.000Z");
    const state = resolveRetryState({
      currentAttempts: 4,
      maxAttempts: 5,
      baseDelayMs: 5000,
      maxDelayMs: 120000,
      nowMs: now,
    });

    expect(state.attempts).toBe(5);
    expect(state.shouldDeadLetter).toBe(true);
    expect(state.retryDelayMs).toBe(0);
    expect(state.runAtIso).toBe("2026-02-26T00:00:00.000Z");
  });

  test("resolveRetryState normalizes invalid inputs", () => {
    const now = Date.parse("2026-02-26T00:00:00.000Z");
    const state = resolveRetryState({
      currentAttempts: -3,
      maxAttempts: 0,
      baseDelayMs: 0,
      maxDelayMs: 0,
      nowMs: now,
    });

    expect(state.attempts).toBe(1);
    expect(state.shouldDeadLetter).toBe(true);
    expect(state.retryDelayMs).toBe(0);
  });
});
