import type {
  Agent,
  AuditEvent,
  MemoryItem,
  Session,
  TranscriptEvent,
  UsageEvent,
  UsageSummary,
} from "../types";
import type {
  AgentStore,
  AuditStore,
  JobQueue,
  MemoryStore,
  SessionStore,
  TranscriptStore,
  UsageStore,
} from "../container/types";

const toMillis = (value: string): number => Date.parse(value);

const dot = (a: number[], b: number[]): number => {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i += 1) {
    sum += a[i]! * b[i]!;
  }
  return sum;
};

export class InMemoryJobQueue implements JobQueue {
  readonly items: Array<{ type: string; payload: Record<string, unknown> }> = [];

  async enqueue(input: { type: string; payload: Record<string, unknown> }): Promise<void> {
    this.items.push({ type: input.type, payload: input.payload });
  }
}

export function createInMemoryStores(): {
  agents: AgentStore;
  sessions: SessionStore;
  transcripts: TranscriptStore;
  memory: MemoryStore;
  usage: UsageStore;
  audit: AuditStore;
  jobs: InMemoryJobQueue;
  reset(): void;
} {
  const agents: Agent[] = [];
  const sessions: Session[] = [];
  const transcripts: TranscriptEvent[] = [];
  const memoryItems: MemoryItem[] = [];
  const usageEvents: UsageEvent[] = [];
  const auditEvents: AuditEvent[] = [];
  const jobQueue = new InMemoryJobQueue();
  const currentSessions = new Map<string, string>();

  const counters = {
    agent: 0,
    session: 0,
    transcript: 0,
    memory: 0,
    usage: 0,
    audit: 0,
  };

  const nextId = (kind: keyof typeof counters): string => {
    counters[kind] += 1;
    return `${kind}-${counters[kind]}`;
  };

  const agentStore: AgentStore = {
    async createAgent({ ownerUserId, name, now }) {
      const agent: Agent = {
        id: nextId("agent"),
        ownerUserId,
        name,
        createdAt: now,
        updatedAt: now,
      };
      agents.push(agent);
      return agent;
    },

    async getAgentById(agentId) {
      return agents.find((agent) => agent.id === agentId) ?? null;
    },

    async listAgentsByOwner(ownerUserId) {
      return agents.filter((agent) => agent.ownerUserId === ownerUserId);
    },
  };

  const sessionStore: SessionStore = {
    async getCurrentSession({ agentId, sessionKey }) {
      const key = `${agentId}:${sessionKey}`;
      const sessionId = currentSessions.get(key);
      if (!sessionId) return null;
      return sessions.find((session) => session.id === sessionId) ?? null;
    },

    async createSession({ agentId, sessionKey, now }) {
      const session: Session = {
        id: nextId("session"),
        agentId,
        sessionKey,
        createdAt: now,
        lastActiveAt: now,
      };
      sessions.push(session);
      currentSessions.set(`${agentId}:${sessionKey}`, session.id);
      return session;
    },

    async touchSession({ sessionId, lastActiveAt }) {
      const session = sessions.find((entry) => entry.id === sessionId);
      if (session) {
        session.lastActiveAt = lastActiveAt;
      }
    },
  };

  const transcriptStore: TranscriptStore = {
    async appendEvent({ agentId, sessionId, type, content, tokensIn, tokensOut, createdAt }) {
      const event: TranscriptEvent = {
        id: nextId("transcript"),
        agentId,
        sessionId,
        type,
        content,
        tokensIn,
        tokensOut,
        createdAt,
      };
      transcripts.push(event);
      return event;
    },

    async listRecentEvents({ agentId, sessionId, limit }) {
      const filtered = transcripts
        .filter((event) => event.agentId === agentId && event.sessionId === sessionId)
        .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
      if (limit <= 0) return [];
      return filtered.slice(-limit);
    },

    async getLatestCompaction({ agentId, sessionId }) {
      const matches = transcripts
        .filter(
          (event) =>
            event.agentId === agentId &&
            event.sessionId === sessionId &&
            event.type === "compaction"
        )
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      return matches[0] ?? null;
    },
  };

  const memoryStore: MemoryStore = {
    async insertMemoryItem(input) {
      const item: MemoryItem = {
        id: nextId("memory"),
        agentId: input.agentId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        type: input.type,
        content: input.content,
        tags: [...input.tags],
        sensitivity: input.sensitivity,
        contextEligible: input.contextEligible,
        embedding: input.embedding,
        createdAt: input.now,
        updatedAt: input.now,
      };
      memoryItems.push(item);
      return item;
    },

    async queryTopK({ agentId, embedding, topK, sensitivity, contextEligible }) {
      const filtered = memoryItems.filter((item) => {
        if (item.agentId !== agentId) return false;
        if (typeof contextEligible === "boolean" && item.contextEligible !== contextEligible) {
          return false;
        }
        if (sensitivity && !sensitivity.includes(item.sensitivity)) {
          return false;
        }
        return true;
      });

      const scored = filtered.map((item) => ({
        item,
        score: item.embedding ? dot(item.embedding, embedding) : -Infinity,
      }));

      scored.sort((a, b) => b.score - a.score);

      return scored.slice(0, topK).map((entry) => entry.item);
    },
  };

  const usageStore: UsageStore = {
    async insertUsageEvent(input) {
      const event: UsageEvent = {
        id: nextId("usage"),
        agentId: input.agentId,
        eventType: input.eventType,
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
        costEstimate: input.costEstimate,
        meta: { ...input.meta },
        createdAt: input.createdAt,
      };
      usageEvents.push(event);
      return event;
    },

    async sumUsage({ agentId, from, to }) {
      const fromMillis = toMillis(from);
      const toMillisValue = toMillis(to);
      const summary = usageEvents
        .filter(
          (event) =>
            event.agentId === agentId &&
            toMillis(event.createdAt) >= fromMillis &&
            toMillis(event.createdAt) <= toMillisValue
        )
        .reduce<UsageSummary>(
          (acc, event) => {
            acc.tokensIn += event.tokensIn ?? 0;
            acc.tokensOut += event.tokensOut ?? 0;
            acc.costEstimate += event.costEstimate ?? 0;
            return acc;
          },
          { tokensIn: 0, tokensOut: 0, costEstimate: 0 }
        );
      return summary;
    },
  };

  const auditStore: AuditStore = {
    async insertAuditEvent(input) {
      const event: AuditEvent = {
        id: nextId("audit"),
        tenantId: input.tenantId,
        agentId: input.agentId,
        eventType: input.eventType,
        payload: { ...input.payload },
        createdAt: input.createdAt,
      };
      auditEvents.push(event);
      return event;
    },
  };

  const reset = (): void => {
    agents.length = 0;
    sessions.length = 0;
    transcripts.length = 0;
    memoryItems.length = 0;
    usageEvents.length = 0;
    auditEvents.length = 0;
    jobQueue.items.length = 0;
    currentSessions.clear();
    counters.agent = 0;
    counters.session = 0;
    counters.transcript = 0;
    counters.memory = 0;
    counters.usage = 0;
    counters.audit = 0;
  };

  return {
    agents: agentStore,
    sessions: sessionStore,
    transcripts: transcriptStore,
    memory: memoryStore,
    usage: usageStore,
    audit: auditStore,
    jobs: jobQueue,
    reset,
  };
}
