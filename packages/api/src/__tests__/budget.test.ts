import { describe, expect, test } from "bun:test";
import {
  buildDegradedBudget,
  getUsageWindow,
  projectTotalTokens,
  resolveChatBudgetDegradePolicy,
  resolveChatMaxInputTokens,
  resolveTokenHardCaps,
  wouldExceedChatMaxInputTokens,
  wouldExceedTokenHardCap,
} from "../budget";

describe("budget helpers", () => {
  test("resolveTokenHardCaps parses valid cap env values", () => {
    const caps = resolveTokenHardCaps({
      CHAT_DAILY_TOKEN_HARD_CAP: "100000",
      CHAT_MONTHLY_TOKEN_HARD_CAP: "2000000",
    });

    expect(caps).toEqual({
      dailyTokens: 100000,
      monthlyTokens: 2000000,
    });
  });

  test("resolveTokenHardCaps ignores invalid cap env values", () => {
    const caps = resolveTokenHardCaps({
      CHAT_DAILY_TOKEN_HARD_CAP: "-1",
      CHAT_MONTHLY_TOKEN_HARD_CAP: "abc",
    });

    expect(caps).toEqual({
      dailyTokens: undefined,
      monthlyTokens: undefined,
    });
  });

  test("resolveChatMaxInputTokens parses valid values and ignores invalid ones", () => {
    expect(
      resolveChatMaxInputTokens({
        CHAT_MAX_INPUT_TOKENS: "8192",
      })
    ).toBe(8192);

    expect(
      resolveChatMaxInputTokens({
        CHAT_MAX_INPUT_TOKENS: "0",
      })
    ).toBeUndefined();

    expect(
      resolveChatMaxInputTokens({
        CHAT_MAX_INPUT_TOKENS: "abc",
      })
    ).toBeUndefined();
  });

  test("getUsageWindow creates day and month boundaries", () => {
    const now = new Date("2026-02-26T15:30:00.000Z");

    const day = getUsageWindow("day", now);
    const month = getUsageWindow("month", now);

    expect(day).toEqual({
      from: "2026-02-26T00:00:00.000Z",
      to: "2026-02-26T15:30:00.000Z",
    });
    expect(month).toEqual({
      from: "2026-02-01T00:00:00.000Z",
      to: "2026-02-26T15:30:00.000Z",
    });
  });

  test("projectTotalTokens includes reserve output tokens", () => {
    const projected = projectTotalTokens({
      usage: { tokensIn: 1200, tokensOut: 800 },
      incomingUserTokens: 300,
      reserveOutputTokens: 500,
    });

    expect(projected).toBe(2800);
  });

  test("wouldExceedTokenHardCap reports cap breaches", () => {
    expect(
      wouldExceedTokenHardCap({
        cap: 1000,
        usage: { tokensIn: 400, tokensOut: 300 },
        incomingUserTokens: 100,
        reserveOutputTokens: 150,
      })
    ).toBe(false);

    expect(
      wouldExceedTokenHardCap({
        cap: 1000,
        usage: { tokensIn: 400, tokensOut: 300 },
        incomingUserTokens: 100,
        reserveOutputTokens: 250,
      })
    ).toBe(true);
  });

  test("wouldExceedChatMaxInputTokens reports oversize input", () => {
    expect(
      wouldExceedChatMaxInputTokens({
        incomingUserTokens: 512,
        maxInputTokens: 1024,
      })
    ).toBe(false);

    expect(
      wouldExceedChatMaxInputTokens({
        incomingUserTokens: 2048,
        maxInputTokens: 1024,
      })
    ).toBe(true);
  });

  test("resolveChatBudgetDegradePolicy parses env overrides with defaults", () => {
    const policy = resolveChatBudgetDegradePolicy(
      {
        CHAT_BUDGET_DEGRADE_ENABLED: "1",
        CHAT_DEGRADE_RESERVE_OUTPUT_TOKENS: "128",
        CHAT_DEGRADE_MEMORY_TOPK: "3",
        CHAT_DEGRADE_RECENT_MESSAGES: "6",
      },
      {
        reserveOutputTokens: 2048,
        memoryTopK: 10,
        recentMessages: 30,
      }
    );

    expect(policy).toEqual({
      enabled: true,
      reserveOutputTokens: 128,
      memoryTopK: 3,
      recentMessages: 6,
    });
  });

  test("resolveChatBudgetDegradePolicy falls back to clamped defaults", () => {
    const policy = resolveChatBudgetDegradePolicy(
      {
        CHAT_BUDGET_DEGRADE_ENABLED: "false",
        CHAT_DEGRADE_RESERVE_OUTPUT_TOKENS: "invalid",
        CHAT_DEGRADE_MEMORY_TOPK: "-1",
        CHAT_DEGRADE_RECENT_MESSAGES: "0",
      },
      {
        reserveOutputTokens: 2048,
        memoryTopK: 12,
        recentMessages: 50,
      }
    );

    expect(policy).toEqual({
      enabled: false,
      reserveOutputTokens: 512,
      memoryTopK: 4,
      recentMessages: 10,
    });
  });

  test("buildDegradedBudget clamps only down and reports degraded flag", () => {
    const original = {
      modelWindow: 128000,
      reserveOutputTokens: 2048,
      reserveToolTokens: 512,
      memoryTopK: 8,
      recentMessages: 20,
    };

    const degraded = buildDegradedBudget(original, {
      enabled: true,
      reserveOutputTokens: 256,
      memoryTopK: 4,
      recentMessages: 10,
    });

    expect(degraded.degraded).toBe(true);
    expect(degraded.budget).toEqual({
      modelWindow: 128000,
      reserveOutputTokens: 256,
      reserveToolTokens: 512,
      memoryTopK: 4,
      recentMessages: 10,
    });

    const unchanged = buildDegradedBudget(original, {
      enabled: true,
      reserveOutputTokens: 4096,
      memoryTopK: 99,
      recentMessages: 99,
    });
    expect(unchanged.degraded).toBe(false);
    expect(unchanged.budget).toEqual(original);
  });
});
