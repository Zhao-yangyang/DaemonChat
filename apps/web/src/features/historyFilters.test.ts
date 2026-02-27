import { describe, expect, test } from "bun:test";
import type { MemoryItem, TranscriptEvent } from "@daemon/domain";
import {
  filterMemoryItems,
  filterTranscriptEvents,
  paginateItems,
} from "./historyFilters";

const memoryFixture = (input: Partial<MemoryItem> & { id: string }): MemoryItem => ({
  id: input.id,
  agentId: input.agentId ?? "agent-1",
  scopeType: input.scopeType ?? "user",
  scopeId: input.scopeId ?? "user-1",
  type: input.type ?? "fact",
  content: input.content ?? "",
  tags: input.tags ?? [],
  sensitivity: input.sensitivity ?? "public",
  contextEligible: input.contextEligible ?? true,
  embedding: input.embedding ?? null,
  createdAt: input.createdAt ?? "2026-02-26T00:00:00.000Z",
  updatedAt: input.updatedAt ?? "2026-02-26T00:00:00.000Z",
});

const transcriptFixture = (
  input: Partial<TranscriptEvent> & { id: string; type: TranscriptEvent["type"] }
): TranscriptEvent => ({
  id: input.id,
  agentId: input.agentId ?? "agent-1",
  sessionId: input.sessionId ?? "session-1",
  type: input.type,
  content: input.content ?? { text: "" },
  tokensIn: input.tokensIn ?? null,
  tokensOut: input.tokensOut ?? null,
  createdAt: input.createdAt ?? "2026-02-26T00:00:00.000Z",
});

describe("filterMemoryItems", () => {
  const items: MemoryItem[] = [
    memoryFixture({
      id: "m-1",
      content: "likes sushi",
      sensitivity: "public",
      contextEligible: true,
    }),
    memoryFixture({
      id: "m-2",
      content: "private key detail",
      sensitivity: "private",
      contextEligible: true,
    }),
    memoryFixture({
      id: "m-3",
      content: "disabled memory",
      sensitivity: "public",
      contextEligible: false,
    }),
  ];

  test("filters by keyword", () => {
    const filtered = filterMemoryItems(items, {
      query: "sushi",
      sensitivity: "all",
      contextEligible: "all",
    });

    expect(filtered.map((item) => item.id)).toEqual(["m-1"]);
  });

  test("filters by sensitivity and context eligibility", () => {
    const filtered = filterMemoryItems(items, {
      query: "",
      sensitivity: "public",
      contextEligible: "eligible",
    });

    expect(filtered.map((item) => item.id)).toEqual(["m-1"]);
  });
});

describe("filterTranscriptEvents", () => {
  const events: TranscriptEvent[] = [
    transcriptFixture({
      id: "t-1",
      type: "user_message",
      content: { text: "hello there" },
    }),
    transcriptFixture({
      id: "t-2",
      type: "assistant_message",
      content: { text: "hi!" },
    }),
    transcriptFixture({
      id: "t-3",
      type: "compaction",
      content: { summary: "summary text" },
    }),
  ];

  test("filters by type", () => {
    const filtered = filterTranscriptEvents(events, {
      query: "",
      type: "assistant_message",
    });

    expect(filtered.map((event) => event.id)).toEqual(["t-2"]);
  });

  test("filters by text query in content", () => {
    const filtered = filterTranscriptEvents(events, {
      query: "summary",
      type: "all",
    });

    expect(filtered.map((event) => event.id)).toEqual(["t-3"]);
  });
});

describe("paginateItems", () => {
  test("returns proper page windows", () => {
    const input = [1, 2, 3, 4, 5, 6];

    const page1 = paginateItems(input, { page: 1, pageSize: 2 });
    const page3 = paginateItems(input, { page: 3, pageSize: 2 });

    expect(page1.items).toEqual([1, 2]);
    expect(page1.totalPages).toBe(3);
    expect(page3.items).toEqual([5, 6]);
  });

  test("clamps out-of-range page numbers", () => {
    const input = [1, 2, 3];

    const result = paginateItems(input, { page: 99, pageSize: 2 });

    expect(result.page).toBe(2);
    expect(result.items).toEqual([3]);
  });
});
