import { describe, expect, test } from "bun:test";
import { createMemoryService } from "../usecases/memory";
import { createTestPorts } from "../testing/fixtures";

describe("memory usecases", () => {
  test("writeMemoryItem embeds when missing embedding", async () => {
    let embedCalls = 0;
    const { ports } = createTestPorts({
      llm: {
        embed: async () => {
          embedCalls += 1;
          return [0.5, 0.2];
        },
      },
    });

    const service = createMemoryService({
      memory: ports.memory,
      llm: ports.llm,
      clock: ports.clock,
    });

    const item = await service.writeMemoryItem("agent-1", {
      scopeType: "user",
      scopeId: "user-1",
      type: "fact",
      content: "prefers tea",
      tags: ["drink"],
      sensitivity: "public",
      contextEligible: true,
    });

    expect(embedCalls).toBe(1);
    expect(item.embedding).toEqual([0.5, 0.2]);
  });

  test("retrieveTopMemory returns filtered items", async () => {
    const { ports } = createTestPorts({
      llm: { embed: async () => [1, 0] },
    });

    const service = createMemoryService({
      memory: ports.memory,
      llm: ports.llm,
      clock: ports.clock,
    });

    await service.writeMemoryItem("agent-1", {
      scopeType: "user",
      scopeId: "user-1",
      type: "fact",
      content: "likes coffee",
      tags: [],
      sensitivity: "public",
      contextEligible: true,
      embedding: [1, 0],
    });

    await service.writeMemoryItem("agent-1", {
      scopeType: "user",
      scopeId: "user-1",
      type: "fact",
      content: "secret",
      tags: [],
      sensitivity: "secret",
      contextEligible: true,
      embedding: [0, 1],
    });

    const results = await service.retrieveTopMemory("agent-1", "query", 5, {
      sensitivity: ["public"],
      contextEligible: true,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.content).toBe("likes coffee");
  });
});
