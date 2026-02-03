import { describe, expect, test } from "bun:test";
import { createSessionService } from "../usecases/session";
import { ManualClock } from "../testing/clock";
import { createInMemoryStores } from "../testing/memoryStores";

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
});
