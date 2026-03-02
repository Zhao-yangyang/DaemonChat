import { describe, expect, test } from "bun:test";
import { ForbiddenError, NotFoundError } from "../errors";
import { createSessionService } from "../usecases/session";
import { ManualClock } from "../testing/clock";
import { createInMemoryStores } from "../testing/memoryStores";
import { DEFAULT_AGENT_CONFIG } from "../types";

describe("session usecases", () => {
  test("resolveSession reuses current session and touches lastActiveAt", async () => {
    const stores = createInMemoryStores();
    const clock = new ManualClock("2026-02-03T00:00:00Z");
    const service = createSessionService({ sessions: stores.sessions, clock });

    const first = await service.resolveSession("agent-1", "main");
    expect(first.lastActiveAt).toBe("2026-02-03T00:00:00Z");

    clock.set("2026-02-03T01:00:00Z");
    const second = await service.resolveSession("agent-1", "main");

    expect(second.id).toBe(first.id);
    expect(second.lastActiveAt).toBe("2026-02-03T01:00:00Z");
  });

  test("deleteSession enforces owner check and deletes target session", async () => {
    const stores = createInMemoryStores();
    const clock = new ManualClock("2026-02-03T00:00:00Z");
    const service = createSessionService({ sessions: stores.sessions, agents: stores.agents, clock });

    const agent = await stores.agents.createAgent({
      ownerUserId: "user-1",
      name: "Agent A",
      config: { ...DEFAULT_AGENT_CONFIG },
      now: clock.now(),
    });
    const session = await stores.sessions.createSession({
      agentId: agent.id,
      sessionKey: "main",
      now: clock.now(),
    });

    await expect(service.deleteSession(agent.id, session.id, "user-2")).rejects.toBeInstanceOf(ForbiddenError);
    await service.deleteSession(agent.id, session.id, "user-1");

    const list = await stores.sessions.listRecentSessions({ agentId: agent.id, limit: 10 });
    expect(list).toHaveLength(0);
  });

  test("deleteSession throws when agent not found", async () => {
    const stores = createInMemoryStores();
    const clock = new ManualClock("2026-02-03T00:00:00Z");
    const service = createSessionService({ sessions: stores.sessions, agents: stores.agents, clock });

    await expect(service.deleteSession("missing-agent", "session-1", "user-1")).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  test("renameSession enforces owner check and updates displayName", async () => {
    const stores = createInMemoryStores();
    const clock = new ManualClock("2026-02-03T00:00:00Z");
    const service = createSessionService({ sessions: stores.sessions, agents: stores.agents, clock });

    const agent = await stores.agents.createAgent({
      ownerUserId: "user-1",
      name: "Agent A",
      config: { ...DEFAULT_AGENT_CONFIG },
      now: clock.now(),
    });
    const session = await stores.sessions.createSession({
      agentId: agent.id,
      sessionKey: "main",
      now: clock.now(),
    });

    await expect(service.renameSession(agent.id, session.id, "我的会话", "user-2")).rejects.toBeInstanceOf(
      ForbiddenError
    );
    await service.renameSession(agent.id, session.id, "我的会话", "user-1");

    const list = await stores.sessions.listRecentSessions({ agentId: agent.id, limit: 10 });
    expect(list[0]?.displayName).toBe("我的会话");
  });
});
