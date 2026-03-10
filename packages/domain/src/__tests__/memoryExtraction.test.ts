import { describe, expect, test } from "bun:test";
import { createMemoryExtractionService } from "../usecases/memoryExtraction";
import { createTestPorts } from "../testing/fixtures";

describe("memory extraction usecase", () => {
  test("extractMemoryFromSession writes parsed memory items", async () => {
    const { ports } = createTestPorts({
      llm: {
        completeChat: async () =>
          JSON.stringify([
            {
              type: "preference",
              content: "用户喜欢简洁回答",
              tags: ["style", "preference"],
              sensitivity: "private",
              contextEligible: true,
            },
          ]),
      },
    });
    const service = createMemoryExtractionService({
      transcripts: ports.transcripts,
      memory: ports.memory,
      llm: ports.llm,
      clock: ports.clock,
    });

    await ports.transcripts.appendEvent({
      agentId: "agent-1",
      sessionId: "session-1",
      type: "user_message",
      content: { text: "我喜欢简洁一点的回复" },
      tokensIn: 5,
      tokensOut: null,
      createdAt: ports.clock.now(),
    });

    const created = await service.extractMemoryFromSession("agent-1", "session-1", {
      scopeType: "user",
      scopeId: "user-1",
    });

    expect(created).toHaveLength(1);
    expect(created[0]?.type).toBe("preference");
    expect(created[0]?.content).toContain("简洁");
  });

  test("extractMemoryFromSession tolerates non-json output", async () => {
    const { ports } = createTestPorts({
      llm: {
        completeChat: async () => "not-json",
      },
    });
    const service = createMemoryExtractionService({
      transcripts: ports.transcripts,
      memory: ports.memory,
      llm: ports.llm,
      clock: ports.clock,
    });

    await ports.transcripts.appendEvent({
      agentId: "agent-1",
      sessionId: "session-1",
      type: "user_message",
      content: { text: "hello" },
      tokensIn: 1,
      tokensOut: null,
      createdAt: ports.clock.now(),
    });

    const created = await service.extractMemoryFromSession("agent-1", "session-1", {
      scopeType: "user",
      scopeId: "user-1",
    });
    expect(created).toHaveLength(0);
  });
});
