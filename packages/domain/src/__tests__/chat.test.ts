import { describe, expect, test } from "bun:test";
import { createChatService } from "../usecases/chat";
import { createTestPorts } from "../testing/fixtures";

const streamFromText = async function* (text: string): AsyncIterable<string> {
  for (const part of text.split(" ")) {
    yield part;
  }
};

describe("chat usecases", () => {
  test("chatTurn resolves session, appends events, records usage", async () => {
    const { ports, stores } = createTestPorts({
      llm: {
        streamChat: () => streamFromText("hello there"),
      },
    });

    const service = createChatService({
      sessions: ports.sessions,
      transcripts: ports.transcripts,
      memory: ports.memory,
      usage: ports.usage,
      llm: ports.llm,
      clock: ports.clock,
    });

    const result = await service.chatTurn("agent-1", "main", "hi", {
      system: "system",
      constraints: [],
      taskState: null,
      memoryTopK: 2,
      recentMessages: 5,
      budget: {
        modelWindow: 100,
        reserveOutputTokens: 0,
        reserveToolTokens: 0,
        memoryTopK: 2,
        recentMessages: 5,
      },
    });

    expect(result.assistantText).toBe("hello there");

    const events = await stores.transcripts.listRecentEvents({
      agentId: "agent-1",
      sessionId: result.sessionId,
      limit: 10,
    });

    const types = events.map((event) => event.type);
    expect(types).toContain("user_message");
    expect(types).toContain("assistant_message");

    const usage = await stores.usage.sumUsage({
      agentId: "agent-1",
      from: "2026-02-03T00:00:00Z",
      to: "2026-02-03T23:59:59Z",
    });

    expect(usage.tokensIn).toBeGreaterThan(0);
    expect(usage.tokensOut).toBeGreaterThan(0);
  });

  test("chatTurn injects memory into LLM messages", async () => {
    let capturedMessages: Array<{ role: string; content: string }> = [];

    const { ports } = createTestPorts({
      llm: {
        embed: async () => [1, 0],
        streamChat: async function* ({ messages }) {
          capturedMessages = messages;
          yield "ok";
        },
      },
    });

    await ports.memory.insertMemoryItem({
      agentId: "agent-1",
      scopeType: "user",
      scopeId: "user-1",
      type: "fact",
      content: "likes sushi",
      tags: [],
      sensitivity: "public",
      contextEligible: true,
      embedding: [1, 0],
      now: ports.clock.now(),
    });

    const service = createChatService({
      sessions: ports.sessions,
      transcripts: ports.transcripts,
      memory: ports.memory,
      usage: ports.usage,
      llm: ports.llm,
      clock: ports.clock,
    });

    await service.chatTurn("agent-1", "main", "hello", {
      system: "system",
      constraints: [],
      taskState: null,
      memoryTopK: 3,
      recentMessages: 5,
      budget: {
        modelWindow: 100,
        reserveOutputTokens: 0,
        reserveToolTokens: 0,
        memoryTopK: 3,
        recentMessages: 5,
      },
    });

    const memoryMessage = capturedMessages.find(
      (message) => message.role === "system" && message.content.includes("Memory")
    );

    expect(memoryMessage?.content).toContain("likes sushi");
  });
});
