import { describe, expect, test } from "bun:test";
import {
  parseMemoryQueryState,
  parseTranscriptQueryState,
  parseUsageQueryState,
  toMemorySearchParams,
  toTranscriptSearchParams,
  toUsageSearchParams,
} from "./historyQueryState";

describe("memory query state", () => {
  test("parses valid URL params", () => {
    const params = new URLSearchParams({
      agent: "agent-1",
      q: "sushi",
      sensitivity: "private",
      eligibility: "ineligible",
      page: "3",
    });

    const state = parseMemoryQueryState(params);
    expect(state).toEqual({
      agentId: "agent-1",
      query: "sushi",
      sensitivityFilter: "private",
      eligibilityFilter: "ineligible",
      page: 3,
    });
  });

  test("falls back to defaults for invalid values", () => {
    const params = new URLSearchParams({
      sensitivity: "invalid",
      eligibility: "invalid",
      page: "x",
    });

    const state = parseMemoryQueryState(params);
    expect(state.sensitivityFilter).toBe("all");
    expect(state.eligibilityFilter).toBe("all");
    expect(state.page).toBe(1);
  });

  test("serializes non-default memory state", () => {
    const serialized = toMemorySearchParams({
      agentId: "agent-1",
      query: "hello",
      sensitivityFilter: "public",
      eligibilityFilter: "eligible",
      page: 2,
    }).toString();

    expect(serialized).toContain("agent=agent-1");
    expect(serialized).toContain("q=hello");
    expect(serialized).toContain("sensitivity=public");
    expect(serialized).toContain("eligibility=eligible");
    expect(serialized).toContain("page=2");
  });
});

describe("transcript query state", () => {
  test("parses valid transcript params", () => {
    const params = new URLSearchParams({
      agent: "agent-1",
      session: "session-1",
      q: "summary",
      type: "compaction",
      limit: "120",
      page: "4",
    });

    const state = parseTranscriptQueryState(params);
    expect(state).toEqual({
      agentId: "agent-1",
      sessionId: "session-1",
      query: "summary",
      typeFilter: "compaction",
      limit: 120,
      page: 4,
    });
  });

  test("normalizes invalid transcript params", () => {
    const params = new URLSearchParams({
      type: "invalid",
      limit: "-10",
      page: "0",
    });

    const state = parseTranscriptQueryState(params);
    expect(state.typeFilter).toBe("all");
    expect(state.limit).toBe(50);
    expect(state.page).toBe(1);
  });

  test("serializes transcript state", () => {
    const serialized = toTranscriptSearchParams({
      agentId: "agent-1",
      sessionId: "session-2",
      query: "hello",
      typeFilter: "assistant_message",
      limit: 30,
      page: 2,
    }).toString();

    expect(serialized).toContain("agent=agent-1");
    expect(serialized).toContain("session=session-2");
    expect(serialized).toContain("q=hello");
    expect(serialized).toContain("type=assistant_message");
    expect(serialized).toContain("limit=30");
    expect(serialized).toContain("page=2");
  });
});

describe("usage query state", () => {
  test("parses usage params with defaults", () => {
    const params = new URLSearchParams({
      agent: "agent-2",
      period: "month",
    });

    const state = parseUsageQueryState(params);
    expect(state).toEqual({
      agentId: "agent-2",
      period: "month",
    });
  });

  test("normalizes invalid usage period", () => {
    const params = new URLSearchParams({
      period: "year",
    });

    const state = parseUsageQueryState(params);
    expect(state).toEqual({
      agentId: "",
      period: "day",
    });
  });

  test("serializes usage query state", () => {
    const serialized = toUsageSearchParams({
      agentId: "agent-3",
      period: "month",
    }).toString();

    expect(serialized).toContain("agent=agent-3");
    expect(serialized).toContain("period=month");
  });
});
