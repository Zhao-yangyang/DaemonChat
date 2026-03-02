import type {
  Agent,
  AgentConfig,
  AuditEvent,
  MemoryItem,
  Session,
  TranscriptEvent,
  UsageEvent,
  UsageSummary,
} from "../types";
import { DEFAULT_AGENT_CONFIG } from "../types";
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

const toBucketStart = (value: string, bucket: "hour" | "day"): string => {
  const date = new Date(value);
  if (bucket === "hour") {
    date.setMinutes(0, 0, 0);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date.toISOString();
};

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
    async createAgent({ ownerUserId, name, config, now }) {
      const agent: Agent = {
        id: nextId("agent"),
        ownerUserId,
        name,
        config: { ...DEFAULT_AGENT_CONFIG, ...config },
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

    async updateAgent({ agentId, name, config, now }) {
      const agent = agents.find((a) => a.id === agentId);
      if (!agent) throw new Error("Agent not found");
      if (name !== undefined) agent.name = name;
      if (config !== undefined) {
        agent.config = { ...agent.config, ...config };
      }
      agent.updatedAt = now;
      return { ...agent };
    },

    async deleteAgent(agentId) {
      const index = agents.findIndex((agent) => agent.id === agentId);
      if (index >= 0) {
        agents.splice(index, 1);
      }
    },
  };

  const sessionStore: SessionStore = {
    async getCurrentSession({ agentId, sessionKey }) {
      const key = `${agentId}:${sessionKey}`;
      const sessionId = currentSessions.get(key);
      if (!sessionId) return null;
      return sessions.find((session) => session.id === sessionId) ?? null;
    },

    async listRecentSessions({ agentId, limit }) {
      if (limit <= 0) return [];
      return sessions
        .filter((session) => session.agentId === agentId)
        .sort((a, b) => toMillis(b.lastActiveAt) - toMillis(a.lastActiveAt))
        .slice(0, limit);
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

    async deleteSession({ agentId, sessionId }) {
      const index = sessions.findIndex(
        (session) => session.id === sessionId && session.agentId === agentId
      );
      if (index < 0) return;
      const [removed] = sessions.splice(index, 1);
      if (!removed) return;
      const key = `${removed.agentId}:${removed.sessionKey}`;
      const current = currentSessions.get(key);
      if (current === removed.id) {
        currentSessions.delete(key);
      }
    },
  };

  const transcriptStore: TranscriptStore = {
    async appendEvent({
      agentId,
      sessionId,
      requestId,
      type,
      content,
      tokensIn,
      tokensOut,
      createdAt,
    }) {
      const event: TranscriptEvent = {
        id: nextId("transcript"),
        agentId,
        sessionId,
        requestId: requestId ?? null,
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

    async listEventsByRequestId({ agentId, sessionId, requestId }) {
      return transcripts
        .filter(
          (event) =>
            event.agentId === agentId &&
            event.sessionId === sessionId &&
            event.requestId === requestId
        )
        .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
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

    async listMemoryItems({ agentId, limit }) {
      return memoryItems
        .filter((item) => item.agentId === agentId)
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
        .slice(0, limit);
    },

    async queryTopK({
      agentId,
      embedding,
      topK,
      sensitivity,
      contextEligible,
      scopeType,
      scopeId,
    }) {
      const filtered = memoryItems.filter((item) => {
        if (item.agentId !== agentId) return false;
        if (typeof contextEligible === "boolean" && item.contextEligible !== contextEligible) {
          return false;
        }
        if (sensitivity && !sensitivity.includes(item.sensitivity)) {
          return false;
        }
        if (scopeType && item.scopeType !== scopeType) {
          return false;
        }
        if (scopeId && item.scopeId !== scopeId) {
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

    async seriesUsage({ agentId, from, to, bucket }) {
      const fromMillis = toMillis(from);
      const toMillisValue = toMillis(to);
      const buckets = new Map<
        string,
        { tokensIn: number; tokensOut: number; costEstimate: number }
      >();

      for (const event of usageEvents) {
        const createdAt = toMillis(event.createdAt);
        if (event.agentId !== agentId || createdAt < fromMillis || createdAt > toMillisValue) {
          continue;
        }
        const bucketStart = toBucketStart(event.createdAt, bucket);
        const current = buckets.get(bucketStart) ?? {
          tokensIn: 0,
          tokensOut: 0,
          costEstimate: 0,
        };
        current.tokensIn += event.tokensIn ?? 0;
        current.tokensOut += event.tokensOut ?? 0;
        current.costEstimate += event.costEstimate ?? 0;
        buckets.set(bucketStart, current);
      }

      return [...buckets.entries()]
        .sort((a, b) => toMillis(a[0]) - toMillis(b[0]))
        .map(([bucketStart, value]) => ({
          bucketStart,
          tokensIn: value.tokensIn,
          tokensOut: value.tokensOut,
          costEstimate: value.costEstimate,
        }));
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
