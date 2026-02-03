import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type { Agent } from "../types";
import type { AgentStore, Clock } from "../container/types";

export function createAgentService(ports: { agents: AgentStore; clock: Clock }) {
  return {
    async createAgent(ownerUserId: string, name: string): Promise<Agent> {
      const trimmed = name.trim();
      if (!trimmed) {
        throw new ValidationError("Agent name is required");
      }

      return ports.agents.createAgent({
        ownerUserId,
        name: trimmed,
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
  };
}
