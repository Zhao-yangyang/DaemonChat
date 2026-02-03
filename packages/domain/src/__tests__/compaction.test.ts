import { describe, expect, test } from "bun:test";
import { createCompactionService } from "../usecases/compaction";
import { createTestPorts } from "../testing/fixtures";

describe("compaction usecases", () => {
  test("compactIfNeeded writes compaction event", async () => {
    const { ports, stores } = createTestPorts({
      llm: {
        completeChat: async () => "summary",
      },
    });

    const service = createCompactionService({
      transcripts: ports.transcripts,
      llm: ports.llm,
      clock: ports.clock,
    });

    const result = await service.compactIfNeeded("agent-1", "session-1", {
      shouldCompact: true,
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "hello" },
      ],
    });

    expect(result?.type).toBe("compaction");
    expect(result?.content).toEqual({ summary: "summary" });

    const compaction = await stores.transcripts.getLatestCompaction({
      agentId: "agent-1",
      sessionId: "session-1",
    });

    expect(compaction?.content).toEqual({ summary: "summary" });
  });

  test("compactIfNeeded no-op when not required", async () => {
    const { ports, stores } = createTestPorts();
    const service = createCompactionService({
      transcripts: ports.transcripts,
      llm: ports.llm,
      clock: ports.clock,
    });

    const result = await service.compactIfNeeded("agent-1", "session-1", {
      shouldCompact: false,
      messages: [],
    });

    expect(result).toBeNull();

    const compaction = await stores.transcripts.getLatestCompaction({
      agentId: "agent-1",
      sessionId: "session-1",
    });

    expect(compaction).toBeNull();
  });
});
