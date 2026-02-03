import { describe, expect, test } from "bun:test";
import { ForbiddenError, ValidationError } from "../errors";
import { createAgentService } from "../usecases/agent";
import { createTestPorts } from "../testing/fixtures";

describe("agent usecases", () => {
  test("createAgent validates name and lists per owner", async () => {
    const { ports } = createTestPorts();
    const service = createAgentService({ agents: ports.agents, clock: ports.clock });

    const agent = await service.createAgent("user-1", "Alpha");
    expect(agent.ownerUserId).toBe("user-1");
    expect(agent.name).toBe("Alpha");

    await expect(service.createAgent("user-1", " ")).rejects.toBeInstanceOf(ValidationError);

    await service.createAgent("user-2", "Beta");

    const ownerOneAgents = await service.listAgents("user-1");
    expect(ownerOneAgents).toHaveLength(1);
  });

  test("getAgent enforces ownership", async () => {
    const { ports } = createTestPorts();
    const service = createAgentService({ agents: ports.agents, clock: ports.clock });

    const agent = await service.createAgent("user-2", "Gamma");

    await expect(service.getAgent(agent.id, "user-1")).rejects.toBeInstanceOf(ForbiddenError);

    const loaded = await service.getAgent(agent.id, "user-2");
    expect(loaded.id).toBe(agent.id);
  });
});
