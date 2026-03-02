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
    let capturedMessages: Array<{ role: string; content: string | unknown[] }> = [];

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
      (message) => message.role === "system" && typeof message.content === "string" && message.content.includes("Memory")
    );

    expect(memoryMessage?.content).toContain("likes sushi");
  });

  test("chatTurn enqueues MEMORY_FLUSH when memoryScope is provided", async () => {
    const { ports, stores } = createTestPorts({
      llm: {
        streamChat: () => streamFromText("ok"),
      },
    });
    const service = createChatService({
      jobs: ports.jobs,
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
      memoryTopK: 2,
      recentMessages: 5,
      memoryScope: { scopeType: "user", scopeId: "user-1" },
      budget: {
        modelWindow: 100,
        reserveOutputTokens: 0,
        reserveToolTokens: 0,
        memoryTopK: 2,
        recentMessages: 5,
      },
    });

    expect(stores.jobs.items.at(-1)).toEqual({
      type: "MEMORY_FLUSH",
      payload: {
        agentId: "agent-1",
        sessionId: "session-1",
        scopeType: "user",
        scopeId: "user-1",
      },
    });
  });

  test("chatTurn only injects public memory by default", async () => {
    let capturedMessages: Array<{ role: string; content: string | unknown[] }> = [];

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
      content: "public memory",
      tags: [],
      sensitivity: "public",
      contextEligible: true,
      embedding: [1, 0],
      now: ports.clock.now(),
    });

    await ports.memory.insertMemoryItem({
      agentId: "agent-1",
      scopeType: "user",
      scopeId: "user-1",
      type: "fact",
      content: "private memory",
      tags: [],
      sensitivity: "private",
      contextEligible: true,
      embedding: [1, 0],
      now: ports.clock.now(),
    });

    await ports.memory.insertMemoryItem({
      agentId: "agent-1",
      scopeType: "user",
      scopeId: "user-1",
      type: "fact",
      content: "secret memory",
      tags: [],
      sensitivity: "secret",
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
      memoryTopK: 5,
      recentMessages: 5,
      budget: {
        modelWindow: 200,
        reserveOutputTokens: 0,
        reserveToolTokens: 0,
        memoryTopK: 5,
        recentMessages: 5,
      },
    });

    const memoryMessage = capturedMessages.find(
      (message) => message.role === "system" && typeof message.content === "string" && message.content.includes("Memory")
    );

    expect(memoryMessage?.content).toContain("public memory");
    expect(memoryMessage?.content).not.toContain("private memory");
    expect(memoryMessage?.content).not.toContain("secret memory");
  });

  test("chatTurn filters memory injection by explicit memory scope", async () => {
    let capturedMessages: Array<{ role: string; content: string | unknown[] }> = [];

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
      content: "user one memory",
      tags: [],
      sensitivity: "public",
      contextEligible: true,
      embedding: [1, 0],
      now: ports.clock.now(),
    });

    await ports.memory.insertMemoryItem({
      agentId: "agent-1",
      scopeType: "user",
      scopeId: "user-2",
      type: "fact",
      content: "user two memory",
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
      memoryTopK: 5,
      recentMessages: 5,
      memoryScope: {
        scopeType: "user",
        scopeId: "user-1",
      },
      budget: {
        modelWindow: 200,
        reserveOutputTokens: 0,
        reserveToolTokens: 0,
        memoryTopK: 5,
        recentMessages: 5,
      },
    });

    const memoryMessage = capturedMessages.find(
      (message) => message.role === "system" && typeof message.content === "string" && message.content.includes("Memory")
    );

    expect(memoryMessage?.content).toContain("user one memory");
    expect(memoryMessage?.content).not.toContain("user two memory");
  });

  test("chatTurnStream yields chunks and appends events", async () => {
    const { ports, stores } = createTestPorts({
      llm: {
        streamChat: async function* () {
          yield "hello ";
          yield "world";
        },
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

    const result = await service.chatTurnStream("agent-1", "main", "hi", {
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

    let combined = "";
    for await (const chunk of result.stream) {
      combined += chunk;
    }

    expect(combined).toBe("hello world");

    const events = await stores.transcripts.listRecentEvents({
      agentId: "agent-1",
      sessionId: result.sessionId,
      limit: 10,
    });

    expect(events.some((event) => event.type === "assistant_message")).toBe(true);
  });

  test("chatTurn records usage costEstimate when model pricing is provided", async () => {
    const { ports } = createTestPorts({
      llm: {
        streamChat: () => streamFromText("priced response"),
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

    await service.chatTurn("agent-1", "main", "hello pricing", {
      system: "system",
      constraints: [],
      taskState: null,
      memoryTopK: 2,
      recentMessages: 5,
      model: "gpt-4o-mini",
      pricing: {
        inputPer1MUsd: 0.15,
        outputPer1MUsd: 0.6,
      },
      budget: {
        modelWindow: 100,
        reserveOutputTokens: 0,
        reserveToolTokens: 0,
        memoryTopK: 2,
        recentMessages: 5,
      },
    });

    const usage = await ports.usage.sumUsage({
      agentId: "agent-1",
      from: "2026-02-03T00:00:00Z",
      to: "2026-02-03T23:59:59Z",
    });

    expect(usage.costEstimate).toBeGreaterThan(0);
  });

  test("chatTurn records resolved model metadata in usage events", async () => {
    const { ports } = createTestPorts({
      llm: {
        streamChat: async function* ({ onModelResolved }) {
          onModelResolved?.({
            model: "actual-primary-model",
            route: "primary",
          });
          yield "resolved";
          yield "model";
        },
      },
    });

    const capturedUsage: Array<Record<string, unknown>> = [];
    const service = createChatService({
      sessions: ports.sessions,
      transcripts: ports.transcripts,
      memory: ports.memory,
      usage: {
        ...ports.usage,
        insertUsageEvent: async (input) => {
          capturedUsage.push(input.meta);
          return ports.usage.insertUsageEvent(input);
        },
      },
      llm: ports.llm,
      clock: ports.clock,
    });

    await service.chatTurn("agent-1", "main", "hello", {
      system: "system",
      constraints: [],
      taskState: null,
      memoryTopK: 2,
      recentMessages: 5,
      model: "configured-model",
      usageMeta: {
        model_route_strategy: "primary_then_fallback",
      },
      budget: {
        modelWindow: 100,
        reserveOutputTokens: 0,
        reserveToolTokens: 0,
        memoryTopK: 2,
        recentMessages: 5,
      },
    });

    expect(capturedUsage).toHaveLength(1);
    expect(capturedUsage[0]).toMatchObject({
      model_route_strategy: "primary_then_fallback",
      model_route_selected: "primary",
      model_used: "actual-primary-model",
    });
  });

  test("chatTurnStream records fallback model metadata in usage events", async () => {
    const { ports } = createTestPorts({
      llm: {
        streamChat: async function* ({ onModelResolved }) {
          onModelResolved?.({
            model: "actual-fallback-model",
            route: "fallback",
          });
          yield "streamed";
        },
      },
    });

    const capturedUsage: Array<Record<string, unknown>> = [];
    const service = createChatService({
      sessions: ports.sessions,
      transcripts: ports.transcripts,
      memory: ports.memory,
      usage: {
        ...ports.usage,
        insertUsageEvent: async (input) => {
          capturedUsage.push(input.meta);
          return ports.usage.insertUsageEvent(input);
        },
      },
      llm: ports.llm,
      clock: ports.clock,
    });

    const result = await service.chatTurnStream("agent-1", "main", "hello", {
      system: "system",
      constraints: [],
      taskState: null,
      memoryTopK: 2,
      recentMessages: 5,
      model: "configured-model",
      usageMeta: {
        model_route_strategy: "primary_then_fallback",
      },
      budget: {
        modelWindow: 100,
        reserveOutputTokens: 0,
        reserveToolTokens: 0,
        memoryTopK: 2,
        recentMessages: 5,
      },
    });

    let combined = "";
    for await (const chunk of result.stream) {
      combined += chunk;
    }

    expect(combined).toBe("streamed");
    expect(capturedUsage).toHaveLength(1);
    expect(capturedUsage[0]).toMatchObject({
      model_route_strategy: "primary_then_fallback",
      model_route_selected: "fallback",
      model_used: "actual-fallback-model",
    });
  });

  test("chatTurn uses injected token estimator for usage accounting", async () => {
    const { ports } = createTestPorts({
      llm: {
        streamChat: () => streamFromText("tokenized output"),
      },
    });

    const service = createChatService({
      sessions: ports.sessions,
      transcripts: ports.transcripts,
      memory: ports.memory,
      usage: ports.usage,
      llm: ports.llm,
      clock: ports.clock,
      tokenizer: {
        countTokens: () => 9,
      },
    });

    await service.chatTurn("agent-1", "main", "tokenized input", {
      system: "system",
      constraints: [],
      taskState: null,
      memoryTopK: 2,
      recentMessages: 5,
      model: "gpt-4o-mini",
      budget: {
        modelWindow: 100,
        reserveOutputTokens: 0,
        reserveToolTokens: 0,
        memoryTopK: 2,
        recentMessages: 5,
      },
    });

    const usage = await ports.usage.sumUsage({
      agentId: "agent-1",
      from: "2026-02-03T00:00:00Z",
      to: "2026-02-03T23:59:59Z",
    });

    expect(usage.tokensIn).toBe(9);
    expect(usage.tokensOut).toBe(9);
  });

  test("chatTurn reuses completed response when idempotencyKey matches", async () => {
    let streamCalls = 0;
    const { ports, stores } = createTestPorts({
      llm: {
        streamChat: async function* () {
          streamCalls += 1;
          yield "cached";
          yield "reply";
        },
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

    const options = {
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
    };

    const first = await service.chatTurn("agent-1", "main", "hi", {
      ...options,
      idempotencyKey: "req-1",
    });
    const second = await service.chatTurn("agent-1", "main", "hi", {
      ...options,
      idempotencyKey: "req-1",
    });

    expect(first.assistantText).toBe("cached reply");
    expect(second.assistantText).toBe("cached reply");
    expect(streamCalls).toBe(1);

    const events = await stores.transcripts.listRecentEvents({
      agentId: "agent-1",
      sessionId: first.sessionId,
      limit: 20,
    });

    expect(events.filter((event) => event.type === "user_message")).toHaveLength(1);
    expect(events.filter((event) => event.type === "assistant_message")).toHaveLength(1);
  });

  test("chatTurn rejects duplicate in-flight idempotencyKey", async () => {
    const { ports } = createTestPorts({
      llm: {
        streamChat: () => streamFromText("should not run"),
      },
    });

    const session = await ports.sessions.createSession({
      agentId: "agent-1",
      sessionKey: "main",
      now: ports.clock.now(),
    });

    await ports.transcripts.appendEvent({
      agentId: "agent-1",
      sessionId: session.id,
      type: "user_message",
      content: { text: "hello" },
      tokensIn: 1,
      tokensOut: null,
      requestId: "req-inflight",
      createdAt: ports.clock.now(),
    });

    const service = createChatService({
      sessions: ports.sessions,
      transcripts: ports.transcripts,
      memory: ports.memory,
      usage: ports.usage,
      llm: ports.llm,
      clock: ports.clock,
    });

    await expect(
      service.chatTurn("agent-1", "main", "hello", {
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
        idempotencyKey: "req-inflight",
      })
    ).rejects.toMatchObject({
      name: "IdempotencyConflictError",
    });
  });

  test("chatTurn supports 200-turn long conversation on one session", async () => {
    const { ports, stores } = createTestPorts({
      llm: {
        streamChat: () => streamFromText("ok"),
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

    let sessionId = "";
    for (let i = 0; i < 200; i += 1) {
      const result = await service.chatTurn("agent-1", "main", `msg-${i}`, {
        system: "system",
        constraints: [],
        taskState: null,
        memoryTopK: 2,
        recentMessages: 20,
        model: "gpt-4o-mini",
        budget: {
          modelWindow: 1024,
          reserveOutputTokens: 64,
          reserveToolTokens: 32,
          memoryTopK: 2,
          recentMessages: 20,
        },
      });
      if (!sessionId) {
        sessionId = result.sessionId;
      }
      expect(result.sessionId).toBe(sessionId);
      expect(result.assistantText).toBe("ok");
    }

    const events = await stores.transcripts.listRecentEvents({
      agentId: "agent-1",
      sessionId,
      limit: 1000,
    });

    expect(events.filter((event) => event.type === "user_message")).toHaveLength(200);
    expect(events.filter((event) => event.type === "assistant_message")).toHaveLength(200);
  });

  test("chatTurn handles 20 concurrent requests across sessions", async () => {
    const { ports } = createTestPorts({
      llm: {
        streamChat: () => streamFromText("ok"),
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

    const results = await Promise.all(
      Array.from({ length: 20 }).map((_, idx) =>
        service.chatTurn("agent-1", `session-${idx}`, `hello-${idx}`, {
          system: "system",
          constraints: [],
          taskState: null,
          memoryTopK: 2,
          recentMessages: 5,
          model: "gpt-4o-mini",
          budget: {
            modelWindow: 1024,
            reserveOutputTokens: 64,
            reserveToolTokens: 32,
            memoryTopK: 2,
            recentMessages: 5,
          },
        })
      )
    );

    expect(new Set(results.map((item) => item.sessionId)).size).toBe(20);
    expect(results.every((item) => item.assistantText === "ok")).toBe(true);
  });
});
