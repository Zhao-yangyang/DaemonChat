import { describe, expect, test } from "bun:test";
import {
  consumeChatRateLimit,
  createInMemoryChatRateLimiter,
  resolveChatRateLimits,
} from "../rateLimit";

describe("rate limit helpers", () => {
  test("resolveChatRateLimits parses valid env values", () => {
    const limits = resolveChatRateLimits({
      CHAT_QPS_LIMIT: "3",
      CHAT_QPM_LIMIT: "120",
    });

    expect(limits).toEqual({
      qps: 3,
      qpm: 120,
    });
  });

  test("resolveChatRateLimits ignores invalid env values", () => {
    const limits = resolveChatRateLimits({
      CHAT_QPS_LIMIT: "0",
      CHAT_QPM_LIMIT: "x",
    });

    expect(limits).toEqual({
      qps: undefined,
      qpm: undefined,
    });
  });

  test("createInMemoryChatRateLimiter enforces qps and allows after window", () => {
    const limiter = createInMemoryChatRateLimiter();

    expect(limiter.consume({ key: "u:a", qps: 1, nowMs: 1000 })).toEqual({ allowed: true });
    const blocked = limiter.consume({ key: "u:a", qps: 1, nowMs: 1500 });
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    }

    expect(limiter.consume({ key: "u:a", qps: 1, nowMs: 2001 })).toEqual({ allowed: true });
  });

  test("createInMemoryChatRateLimiter enforces qpm", () => {
    const limiter = createInMemoryChatRateLimiter();

    expect(limiter.consume({ key: "u:a", qpm: 2, nowMs: 0 })).toEqual({ allowed: true });
    expect(limiter.consume({ key: "u:a", qpm: 2, nowMs: 1000 })).toEqual({ allowed: true });

    const blocked = limiter.consume({ key: "u:a", qpm: 2, nowMs: 2000 });
    expect(blocked.allowed).toBe(false);
  });

  test("consumeChatRateLimit uses provided store when available", async () => {
    let calls = 0;
    const store = {
      consumeLimit: async () => {
        calls += 1;
        return { allowed: true, retryAfterMs: 0 };
      },
    };

    const result = await consumeChatRateLimit({
      store,
      key: "u:a",
      qps: 1,
      qpm: 1,
    });

    expect(result).toEqual({ allowed: true });
    expect(calls).toBe(2);
  });

  test("consumeChatRateLimit falls back when store throws", async () => {
    const resultA = await consumeChatRateLimit({
      store: {
        consumeLimit: async () => {
          throw new Error("db down");
        },
      },
      key: "u:a",
      qps: 1,
    });
    const resultB = await consumeChatRateLimit({
      store: {
        consumeLimit: async () => {
          throw new Error("db down");
        },
      },
      key: "u:a",
      qps: 1,
    });

    expect(resultA).toEqual({ allowed: true });
    expect(resultB.allowed).toBe(false);
  });
});
