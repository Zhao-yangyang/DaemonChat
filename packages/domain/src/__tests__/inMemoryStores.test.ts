import { describe, expect, test } from "bun:test";
import { createInMemoryStores } from "../testing/memoryStores";

const now = "2026-02-03T00:00:00Z";

describe("In-memory stores", () => {
  test("AgentStore create/list/get", async () => {
    const stores = createInMemoryStores();

    const agentA = await stores.agents.createAgent({
      ownerUserId: "user-1",
      name: "Alpha",
      now,
    });

    const agentB = await stores.agents.createAgent({
      ownerUserId: "user-2",
      name: "Beta",
      now,
    });

    const ownerOneAgents = await stores.agents.listAgentsByOwner("user-1");
    expect(ownerOneAgents).toHaveLength(1);
    expect(ownerOneAgents[0]?.id).toBe(agentA.id);

    const loaded = await stores.agents.getAgentById(agentB.id);
    expect(loaded?.name).toBe("Beta");
  });

  test("SessionStore create/get/touch", async () => {
    const stores = createInMemoryStores();
    const session = await stores.sessions.createSession({
      agentId: "agent-1",
      sessionKey: "main",
      now,
    });

    const current = await stores.sessions.getCurrentSession({
      agentId: "agent-1",
      sessionKey: "main",
    });

    expect(current?.id).toBe(session.id);

    await stores.sessions.touchSession({
      sessionId: session.id,
      lastActiveAt: "2026-02-03T01:00:00Z",
    });

    const touched = await stores.sessions.getCurrentSession({
      agentId: "agent-1",
      sessionKey: "main",
    });

    expect(touched?.lastActiveAt).toBe("2026-02-03T01:00:00Z");
  });

  test("TranscriptStore append/list/getLatestCompaction", async () => {
    const stores = createInMemoryStores();

    await stores.transcripts.appendEvent({
      agentId: "agent-1",
      sessionId: "session-1",
      type: "user_message",
      content: { text: "hi" },
      tokensIn: 2,
      tokensOut: null,
      createdAt: "2026-02-03T00:00:00Z",
    });

    await stores.transcripts.appendEvent({
      agentId: "agent-1",
      sessionId: "session-1",
      type: "compaction",
      content: { summary: "compact" },
      tokensIn: null,
      tokensOut: null,
      createdAt: "2026-02-03T00:10:00Z",
    });

    await stores.transcripts.appendEvent({
      agentId: "agent-1",
      sessionId: "session-1",
      type: "assistant_message",
      content: { text: "hello" },
      tokensIn: null,
      tokensOut: 3,
      createdAt: "2026-02-03T00:20:00Z",
    });

    const recent = await stores.transcripts.listRecentEvents({
      agentId: "agent-1",
      sessionId: "session-1",
      limit: 1,
    });

    expect(recent).toHaveLength(1);
    expect(recent[0]?.type).toBe("assistant_message");

    const compaction = await stores.transcripts.getLatestCompaction({
      agentId: "agent-1",
      sessionId: "session-1",
    });

    expect(compaction?.type).toBe("compaction");
    expect(compaction?.content).toEqual({ summary: "compact" });
  });

  test("MemoryStore insert/queryTopK filters and ranks", async () => {
    const stores = createInMemoryStores();

    const first = await stores.memory.insertMemoryItem({
      agentId: "agent-1",
      scopeType: "user",
      scopeId: "user-1",
      type: "fact",
      content: "alpha",
      tags: [],
      sensitivity: "public",
      contextEligible: true,
      embedding: [1, 0],
      now,
    });

    await stores.memory.insertMemoryItem({
      agentId: "agent-1",
      scopeType: "user",
      scopeId: "user-1",
      type: "fact",
      content: "beta",
      tags: [],
      sensitivity: "private",
      contextEligible: true,
      embedding: [0, 1],
      now,
    });

    await stores.memory.insertMemoryItem({
      agentId: "agent-1",
      scopeType: "user",
      scopeId: "user-1",
      type: "fact",
      content: "hidden",
      tags: [],
      sensitivity: "public",
      contextEligible: false,
      embedding: [1, 1],
      now,
    });

    const top = await stores.memory.queryTopK({
      agentId: "agent-1",
      embedding: [1, 0],
      topK: 5,
      sensitivity: ["public"],
      contextEligible: true,
    });

    expect(top).toHaveLength(1);
    expect(top[0]?.id).toBe(first.id);
  });

  test("UsageStore sumUsage aggregates", async () => {
    const stores = createInMemoryStores();

    await stores.usage.insertUsageEvent({
      agentId: "agent-1",
      eventType: "llm",
      tokensIn: 5,
      tokensOut: 7,
      costEstimate: 0.01,
      meta: {},
      createdAt: "2026-02-03T00:00:00Z",
    });

    await stores.usage.insertUsageEvent({
      agentId: "agent-1",
      eventType: "llm",
      tokensIn: 3,
      tokensOut: 2,
      costEstimate: 0.02,
      meta: {},
      createdAt: "2026-02-03T01:00:00Z",
    });

    const summary = await stores.usage.sumUsage({
      agentId: "agent-1",
      from: "2026-02-03T00:00:00Z",
      to: "2026-02-03T02:00:00Z",
    });

    expect(summary.tokensIn).toBe(8);
    expect(summary.tokensOut).toBe(9);
    expect(summary.costEstimate).toBeCloseTo(0.03, 6);
  });

  test("AuditStore insert + JobQueue enqueue", async () => {
    const stores = createInMemoryStores();

    const audit = await stores.audit.insertAuditEvent({
      tenantId: null,
      agentId: "agent-1",
      eventType: "test",
      payload: { ok: true },
      createdAt: now,
    });

    expect(audit.eventType).toBe("test");

    await stores.jobs.enqueue({ type: "COMPACTION", payload: { sessionId: "s1" } });
    expect(stores.jobs.items).toHaveLength(1);
  });
});
