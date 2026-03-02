import { describe, expect, test } from "bun:test";
import { createMemoryService } from "../usecases/memory";
import { createTestPorts } from "../testing/fixtures";
import { ManualClock } from "../testing/clock";
import { createInMemoryStores } from "../testing/memoryStores";
import type { LlmPort } from "../container/types";

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

  test("listMemoryItems returns recent items", async () => {
    const stores = createInMemoryStores();
    const clock = new ManualClock("2026-02-03T00:00:00Z");
    const llm: LlmPort = {
      streamChat: async function* () {
        yield "";
      },
      completeChat: async () => "",
      embed: async () => [1, 0],
    };

    const service = createMemoryService({ memory: stores.memory, llm, clock });

    await service.writeMemoryItem("agent-1", {
      scopeType: "user",
      scopeId: "user-1",
      type: "fact",
      content: "first",
      tags: [],
      sensitivity: "public",
      contextEligible: true,
      embedding: [1, 0],
    });

    clock.set("2026-02-03T01:00:00Z");

    await service.writeMemoryItem("agent-1", {
      scopeType: "user",
      scopeId: "user-1",
      type: "fact",
      content: "second",
      tags: [],
      sensitivity: "public",
      contextEligible: true,
      embedding: [1, 0],
    });

    const items = await service.listMemoryItems("agent-1", 1);
    expect(items).toHaveLength(1);
    expect(items[0]?.content).toBe("second");
  });

  test("updateMemoryItem updates fields and refreshes embedding when content changes", async () => {
    const { ports } = createTestPorts({
      llm: { embed: async ({ text }) => [text.length, 1] },
    });
    const service = createMemoryService({
      memory: ports.memory,
      llm: ports.llm,
      clock: ports.clock,
    });

    const created = await service.writeMemoryItem("agent-1", {
      scopeType: "user",
      scopeId: "user-1",
      type: "fact",
      content: "初始",
      tags: [],
      sensitivity: "public",
      contextEligible: true,
      embedding: [1, 0],
    });

    const updated = await service.updateMemoryItem("agent-1", created.id, {
      content: "已更新内容",
      tags: ["标签A", "标签B"],
      sensitivity: "private",
      contextEligible: false,
    });

    expect(updated.content).toBe("已更新内容");
    expect(updated.tags).toEqual(["标签A", "标签B"]);
    expect(updated.sensitivity).toBe("private");
    expect(updated.contextEligible).toBe(false);
    expect(updated.embedding).toEqual([5, 1]);
  });

  test("deleteMemoryItem removes target memory", async () => {
    const { ports } = createTestPorts({
      llm: { embed: async () => [1, 0] },
    });
    const service = createMemoryService({
      memory: ports.memory,
      llm: ports.llm,
      clock: ports.clock,
    });

    const created = await service.writeMemoryItem("agent-1", {
      scopeType: "user",
      scopeId: "user-1",
      type: "fact",
      content: "待删除",
      tags: [],
      sensitivity: "public",
      contextEligible: true,
      embedding: [1, 0],
    });

    await service.deleteMemoryItem("agent-1", created.id);
    const items = await service.listMemoryItems("agent-1", 20);
    expect(items.some((item) => item.id === created.id)).toBe(false);
  });
});
