import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type { Session } from "../types";
import type { AgentStore, Clock, SessionStore } from "../container/types";

export function createSessionService(ports: {
  sessions: SessionStore;
  agents?: AgentStore;
  clock: Clock;
}) {
  return {
    async resolveSession(agentId: string, sessionKey: string): Promise<Session> {
      const trimmed = sessionKey.trim();
      if (!trimmed) {
        throw new ValidationError("Session key is required");
      }

      const existing = await ports.sessions.getCurrentSession({
        agentId,
        sessionKey: trimmed,
      });

      const now = ports.clock.now();
      const session =
        existing ??
        (await ports.sessions.createSession({
          agentId,
          sessionKey: trimmed,
          now,
        }));

      await ports.sessions.touchSession({
        sessionId: session.id,
        lastActiveAt: now,
      });

      return { ...session, lastActiveAt: now };
    },

    async listRecentSessions(
      agentId: string,
      limit = 20,
      includeArchived?: boolean,
    ): Promise<Session[]> {
      const normalizedLimit = Number.isFinite(limit) ? Math.floor(limit) : 20;
      if (normalizedLimit <= 0) {
        throw new ValidationError("Limit must be greater than 0");
      }
      return ports.sessions.listRecentSessions({
        agentId,
        limit: Math.min(normalizedLimit, 100),
        includeArchived,
      });
    },

    async deleteSession(agentId: string, sessionId: string, ownerUserId: string): Promise<void> {
      if (!ports.agents) {
        throw new ValidationError("Session delete requires agent store");
      }
      const agent = await ports.agents.getAgentById(agentId);
      if (!agent) {
        throw new NotFoundError("Agent not found");
      }
      if (agent.ownerUserId !== ownerUserId) {
        throw new ForbiddenError("Agent access denied");
      }
      const trimmedSessionId = sessionId.trim();
      if (!trimmedSessionId) {
        throw new ValidationError("Session id is required");
      }
      await ports.sessions.deleteSession({ agentId, sessionId: trimmedSessionId });
    },

    async renameSession(
      agentId: string,
      sessionId: string,
      displayName: string,
      ownerUserId: string,
    ): Promise<void> {
      if (!ports.agents) {
        throw new ValidationError("Session rename requires agent store");
      }
      const agent = await ports.agents.getAgentById(agentId);
      if (!agent) {
        throw new NotFoundError("Agent not found");
      }
      if (agent.ownerUserId !== ownerUserId) {
        throw new ForbiddenError("Agent access denied");
      }
      const trimmedSessionId = sessionId.trim();
      if (!trimmedSessionId) {
        throw new ValidationError("Session id is required");
      }
      const trimmedDisplayName = displayName.trim();
      if (!trimmedDisplayName) {
        throw new ValidationError("Session display name is required");
      }
      await ports.sessions.renameSession({
        agentId,
        sessionId: trimmedSessionId,
        displayName: trimmedDisplayName,
      });
    },

    async archiveSession(agentId: string, sessionId: string, ownerUserId: string): Promise<void> {
      if (!ports.agents) {
        throw new ValidationError("Session archive requires agent store");
      }
      const agent = await ports.agents.getAgentById(agentId);
      if (!agent) {
        throw new NotFoundError("Agent not found");
      }
      if (agent.ownerUserId !== ownerUserId) {
        throw new ForbiddenError("Agent access denied");
      }
      const trimmedSessionId = sessionId.trim();
      if (!trimmedSessionId) {
        throw new ValidationError("Session id is required");
      }
      await ports.sessions.archiveSession({ agentId, sessionId: trimmedSessionId });
    },

    async unarchiveSession(agentId: string, sessionId: string, ownerUserId: string): Promise<void> {
      if (!ports.agents) {
        throw new ValidationError("Session unarchive requires agent store");
      }
      const agent = await ports.agents.getAgentById(agentId);
      if (!agent) {
        throw new NotFoundError("Agent not found");
      }
      if (agent.ownerUserId !== ownerUserId) {
        throw new ForbiddenError("Agent access denied");
      }
      const trimmedSessionId = sessionId.trim();
      if (!trimmedSessionId) {
        throw new ValidationError("Session id is required");
      }
      await ports.sessions.unarchiveSession({ agentId, sessionId: trimmedSessionId });
    },

    async forkSession(
      agentId: string,
      parentSessionId: string,
      forkFromEventId: string,
      ownerUserId: string,
    ): Promise<Session> {
      if (!ports.agents) {
        throw new ValidationError("Session fork requires agent store");
      }
      const agent = await ports.agents.getAgentById(agentId);
      if (!agent) {
        throw new NotFoundError("Agent not found");
      }
      if (agent.ownerUserId !== ownerUserId) {
        throw new ForbiddenError("Agent access denied");
      }
      const trimmedParent = parentSessionId.trim();
      const trimmedForkFrom = forkFromEventId.trim();
      if (!trimmedParent || !trimmedForkFrom) {
        throw new ValidationError("Parent session id and fork-from event id are required");
      }
      const now = ports.clock.now();
      return ports.sessions.createForkedSession({
        agentId,
        parentSessionId: trimmedParent,
        forkFromEventId: trimmedForkFrom,
        now,
      });
    },
  };
}
