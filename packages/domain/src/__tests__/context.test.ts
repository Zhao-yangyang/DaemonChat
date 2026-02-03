import { describe, expect, test } from "bun:test";
import { buildContextPack } from "../context/buildContextPack";
import type { ContextBudget, MemoryItem, TranscriptEvent } from "../types";

const budgetBase: ContextBudget = {
  modelWindow: 120,
  reserveOutputTokens: 0,
  reserveToolTokens: 0,
  memoryTopK: 10,
  recentMessages: 10,
};

const makeEvent = (content: string, createdAt: string, type: TranscriptEvent["type"]): TranscriptEvent => ({
  id: `event-${createdAt}`,
  agentId: "agent-1",
  sessionId: "session-1",
  type,
  content: { text: content },
  tokensIn: null,
  tokensOut: null,
  createdAt,
});

const makeMemory = (content: string, id: string): MemoryItem => ({
  id,
  agentId: "agent-1",
  scopeType: "user",
  scopeId: "user-1",
  type: "fact",
  content,
  tags: [],
  sensitivity: "public",
  contextEligible: true,
  embedding: [1, 0, 0],
  createdAt: "2026-02-03T00:00:00Z",
  updatedAt: "2026-02-03T00:00:00Z",
});

describe("buildContextPack", () => {
  test("trims recent messages before memory", () => {
    const recentMessages = [
      makeEvent("x".repeat(200), "2026-02-03T00:00:00Z", "user_message"),
      makeEvent("y".repeat(200), "2026-02-03T00:01:00Z", "assistant_message"),
      makeEvent("z".repeat(200), "2026-02-03T00:02:00Z", "user_message"),
    ];

    const pack = buildContextPack({
      system: "system",
      constraints: [],
      taskState: null,
      memoryItems: [],
      recentMessages,
      userInput: "hi",
      budget: budgetBase,
    });

    expect(pack.recentMessages.length).toBeLessThan(recentMessages.length);
    expect(pack.memoryTopK).toHaveLength(0);
  });

  test("trims memory items after recent messages", () => {
    const memoryItems = [
      makeMemory("alpha".repeat(80), "mem-1"),
      makeMemory("beta".repeat(80), "mem-2"),
      makeMemory("gamma".repeat(80), "mem-3"),
    ];

    const pack = buildContextPack({
      system: "system",
      constraints: [],
      taskState: null,
      memoryItems,
      recentMessages: [],
      userInput: "hi",
      budget: { ...budgetBase, modelWindow: 60 },
    });

    expect(pack.memoryTopK.length).toBeLessThan(memoryItems.length);
  });

  test("flags compaction when still over budget", () => {
    const pack = buildContextPack({
      system: "x".repeat(400),
      constraints: [],
      taskState: null,
      memoryItems: [],
      recentMessages: [],
      userInput: "y".repeat(400),
      budget: { ...budgetBase, modelWindow: 50 },
    });

    expect(pack.shouldCompact).toBe(true);
  });
});
