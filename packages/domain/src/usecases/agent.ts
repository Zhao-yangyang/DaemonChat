import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { DEFAULT_AGENT_CONFIG, type Agent, type AgentConfig } from "../types";
import type { AgentStore, Clock } from "../container/types";

export function createAgentService(ports: { agents: AgentStore; clock: Clock }) {
  return {
    async createAgent(ownerUserId: string, name: string, config?: Partial<AgentConfig>): Promise<Agent> {
      const trimmed = name.trim();
      if (!trimmed) {
        throw new ValidationError("Agent name is required");
      }

      return ports.agents.createAgent({
        ownerUserId,
        name: trimmed,
        config: { ...DEFAULT_AGENT_CONFIG, ...config },
        now: ports.clock.now(),
      });
    },

    async getAgent(agentId: string, ownerUserId: string): Promise<Agent> {
      const agent = await ports.agents.getAgentById(agentId);
      if (!agent) {
        throw new NotFoundError("Agent not found");
      }
      if (agent.ownerUserId !== ownerUserId) {
        throw new ForbiddenError("Agent access denied");
      }
      return agent;
    },

    async listAgents(ownerUserId: string): Promise<Agent[]> {
      return ports.agents.listAgentsByOwner(ownerUserId);
    },

    async updateAgent(agentId: string, ownerUserId: string, updates: { name?: string; config?: Partial<AgentConfig> }): Promise<Agent> {
      await this.getAgent(agentId, ownerUserId);
      if (updates.name !== undefined) {
        const trimmed = updates.name.trim();
        if (!trimmed) throw new ValidationError("Agent name is required");
        updates = { ...updates, name: trimmed };
      }
      return ports.agents.updateAgent({
        agentId,
        name: updates.name,
        config: updates.config,
        now: ports.clock.now(),
      });
    },

    async deleteAgent(agentId: string, ownerUserId: string): Promise<void> {
      await this.getAgent(agentId, ownerUserId);
      await ports.agents.deleteAgent(agentId);
    },
  };
}
