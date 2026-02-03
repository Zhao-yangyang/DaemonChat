import { ValidationError } from "../errors";
import type { Session } from "../types";
import type { Clock, SessionStore } from "../container/types";

export function createSessionService(ports: { sessions: SessionStore; clock: Clock }) {
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
  };
}
