import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { DEFAULT_AGENT_CONFIG, type Agent, type AgentConfig } from "../types";
import type { AgentStore, Clock, WorkspaceStore } from "../container/types";

export function createAgentService(ports: {
  agents: AgentStore;
  clock: Clock;
  workspace?: WorkspaceStore;
}) {
  return {
    async createAgent(ownerUserId: string, name: string, config?: Partial<AgentConfig>, workspaceId?: string): Promise<Agent> {
      const trimmed = name.trim();
      if (!trimmed) {
        throw new ValidationError("Agent name is required");
      }

      return ports.agents.createAgent({
        ownerUserId,
        name: trimmed,
        config: { ...DEFAULT_AGENT_CONFIG, ...config },
        workspaceId,
        now: ports.clock.now(),
      });
    },

    async getAgent(agentId: string, userId: string): Promise<Agent> {
      const agent = await ports.agents.getAgentById(agentId);
      if (!agent) {
        throw new NotFoundError("Agent not found");
      }
      if (agent.ownerUserId === userId) return agent;
      if (agent.visibility === "public") return agent;
      if (agent.visibility === "workspace" && agent.workspaceId && ports.workspace) {
        const isMember = await ports.workspace.isMember(agent.workspaceId, userId);
        if (isMember) return agent;
      }
      throw new ForbiddenError("Agent access denied");
    },

    /** 仅对 visibility=public 的 Agent 返回，用于未登录分享页 */
    async getPublicAgent(agentId: string): Promise<Agent | null> {
      const agent = await ports.agents.getAgentById(agentId);
      if (!agent || agent.visibility !== "public") return null;
      return agent;
    },

    async listAgents(userId: string, opts?: { workspaceId?: string }): Promise<Agent[]> {
      return ports.agents.listAgentsByOwner(userId, opts);
    },

    async updateAgent(
      agentId: string,
      userId: string,
      updates: { name?: string; config?: Partial<AgentConfig>; visibility?: import("../types").AgentVisibility }
    ): Promise<Agent> {
      await this.getAgent(agentId, userId);
      if (updates.name !== undefined) {
        const trimmed = updates.name.trim();
        if (!trimmed) throw new ValidationError("Agent name is required");
        updates = { ...updates, name: trimmed };
      }
      return ports.agents.updateAgent({
        agentId,
        name: updates.name,
        config: updates.config,
        visibility: updates.visibility,
        now: ports.clock.now(),
      });
    },

    async deleteAgent(agentId: string, userId: string): Promise<void> {
      await this.getAgent(agentId, userId);
      await ports.agents.deleteAgent(agentId);
    },
  };
}
