import { describe, expect, test } from "bun:test";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { DEFAULT_AGENT_CONFIG } from "../types";
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

  test("createAgent uses DEFAULT_AGENT_CONFIG when no config provided", async () => {
    const { ports } = createTestPorts();
    const service = createAgentService({ agents: ports.agents, clock: ports.clock });

    const agent = await service.createAgent("user-1", "DefaultConfig");
    expect(agent.config).toEqual(DEFAULT_AGENT_CONFIG);
  });

  test("createAgent merges custom config with defaults", async () => {
    const { ports } = createTestPorts();
    const service = createAgentService({ agents: ports.agents, clock: ports.clock });

    const agent = await service.createAgent("user-1", "CustomConfig", {
      systemPrompt: "You are a pirate.",
      temperature: 1.2,
    });
    expect(agent.config.systemPrompt).toBe("You are a pirate.");
    expect(agent.config.temperature).toBe(1.2);
    expect(agent.config.memoryTopK).toBe(DEFAULT_AGENT_CONFIG.memoryTopK);
    expect(agent.config.recentMessages).toBe(DEFAULT_AGENT_CONFIG.recentMessages);
  });

  test("updateAgent modifies name and partial config", async () => {
    const { ports } = createTestPorts();
    const service = createAgentService({ agents: ports.agents, clock: ports.clock });

    const agent = await service.createAgent("user-1", "Original");
    const updated = await service.updateAgent(agent.id, "user-1", {
      name: "Renamed",
      config: { systemPrompt: "Be concise." },
    });
    expect(updated.name).toBe("Renamed");
    expect(updated.config.systemPrompt).toBe("Be concise.");
    expect(updated.config.memoryTopK).toBe(DEFAULT_AGENT_CONFIG.memoryTopK);
  });

  test("updateAgent enforces ownership", async () => {
    const { ports } = createTestPorts();
    const service = createAgentService({ agents: ports.agents, clock: ports.clock });

    const agent = await service.createAgent("user-1", "Owned");
    await expect(
      service.updateAgent(agent.id, "user-2", { name: "Stolen" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  test("deleteAgent removes owned agent", async () => {
    const { ports } = createTestPorts();
    const service = createAgentService({ agents: ports.agents, clock: ports.clock });
    const agent = await service.createAgent("user-1", "ToDelete");

    await service.deleteAgent(agent.id, "user-1");
    await expect(service.getAgent(agent.id, "user-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  test("deleteAgent enforces ownership", async () => {
    const { ports } = createTestPorts();
    const service = createAgentService({ agents: ports.agents, clock: ports.clock });
    const agent = await service.createAgent("user-1", "Owned");

    await expect(service.deleteAgent(agent.id, "user-2")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
