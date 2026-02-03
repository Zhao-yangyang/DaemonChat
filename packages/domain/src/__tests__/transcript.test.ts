import { describe, expect, test } from "bun:test";
import { createTranscriptService } from "../usecases/transcript";
import { createInMemoryStores } from "../testing/memoryStores";

describe("transcript usecases", () => {
  test("appendEvent and loadRecentContext", async () => {
    const stores = createInMemoryStores();
    const service = createTranscriptService({ transcripts: stores.transcripts });

    await service.appendEvent("agent-1", "session-1", {
      type: "user_message",
      content: { text: "one" },
      tokensIn: 1,
      tokensOut: null,
      createdAt: "2026-02-03T00:00:00Z",
    });

    await service.appendEvent("agent-1", "session-1", {
      type: "assistant_message",
      content: { text: "two" },
      tokensIn: null,
      tokensOut: 2,
      createdAt: "2026-02-03T00:01:00Z",
    });

    const recent = await service.loadRecentContext("agent-1", "session-1", 1);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.content).toEqual({ text: "two" });
  });

  test("loadLatestCompaction returns last compaction", async () => {
    const stores = createInMemoryStores();
    const service = createTranscriptService({ transcripts: stores.transcripts });

    await service.appendEvent("agent-1", "session-1", {
      type: "compaction",
      content: { summary: "first" },
      tokensIn: null,
      tokensOut: null,
      createdAt: "2026-02-03T00:00:00Z",
    });

    await service.appendEvent("agent-1", "session-1", {
      type: "compaction",
      content: { summary: "latest" },
      tokensIn: null,
      tokensOut: null,
      createdAt: "2026-02-03T00:05:00Z",
    });

    const latest = await service.loadLatestCompaction("agent-1", "session-1");
    expect(latest?.content).toEqual({ summary: "latest" });
  });
});
