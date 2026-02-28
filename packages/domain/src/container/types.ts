import type {
  Agent,
  AgentConfig,
  AuditEvent,
  MemoryItem,
  Session,
  TranscriptEvent,
  UsageEvent,
  UsageSeriesPoint,
  UsageSummary,
  UUID,
  Timestamp,
} from "../types";

export interface Clock {
  now(): Timestamp;
}

export interface AgentStore {
  createAgent(input: { ownerUserId: UUID; name: string; config: AgentConfig; now: Timestamp }): Promise<Agent>;
  getAgentById(agentId: UUID): Promise<Agent | null>;
  listAgentsByOwner(ownerUserId: UUID): Promise<Agent[]>;
  updateAgent(input: { agentId: UUID; name?: string; config?: Partial<AgentConfig>; now: Timestamp }): Promise<Agent>;
}

export interface SessionStore {
  getCurrentSession(input: { agentId: UUID; sessionKey: string }): Promise<Session | null>;
  listRecentSessions(input: { agentId: UUID; limit: number }): Promise<Session[]>;
  createSession(input: {
    agentId: UUID;
    sessionKey: string;
    now: Timestamp;
  }): Promise<Session>;
  touchSession(input: { sessionId: UUID; lastActiveAt: Timestamp }): Promise<void>;
}

export interface TranscriptStore {
  appendEvent(input: {
    agentId: UUID;
    sessionId: UUID;
    requestId?: string | null;
    type: TranscriptEvent["type"];
    content: TranscriptEvent["content"];
    tokensIn: number | null;
    tokensOut: number | null;
    createdAt: Timestamp;
  }): Promise<TranscriptEvent>;
  listRecentEvents(input: {
    agentId: UUID;
    sessionId: UUID;
    limit: number;
  }): Promise<TranscriptEvent[]>;
  getLatestCompaction(input: {
    agentId: UUID;
    sessionId: UUID;
  }): Promise<TranscriptEvent | null>;
  listEventsByRequestId(input: {
    agentId: UUID;
    sessionId: UUID;
    requestId: string;
  }): Promise<TranscriptEvent[]>;
}

export interface MemoryStore {
  insertMemoryItem(
    input: Omit<MemoryItem, "id" | "createdAt" | "updatedAt"> & {
      now: Timestamp;
    }
  ): Promise<MemoryItem>;
  listMemoryItems(input: { agentId: UUID; limit: number }): Promise<MemoryItem[]>;
  queryTopK(input: {
    agentId: UUID;
    embedding: number[];
    topK: number;
    sensitivity?: MemoryItem["sensitivity"][];
    contextEligible?: boolean;
    scopeType?: MemoryItem["scopeType"];
    scopeId?: UUID;
  }): Promise<MemoryItem[]>;
}

export interface UsageStore {
  insertUsageEvent(
    input: Omit<UsageEvent, "id" | "createdAt"> & { createdAt: Timestamp }
  ): Promise<UsageEvent>;
  sumUsage(input: { agentId: UUID; from: Timestamp; to: Timestamp }): Promise<UsageSummary>;
  seriesUsage(input: {
    agentId: UUID;
    from: Timestamp;
    to: Timestamp;
    bucket: "hour" | "day";
  }): Promise<UsageSeriesPoint[]>;
}

export interface AuditStore {
  insertAuditEvent(
    input: Omit<AuditEvent, "id" | "createdAt"> & { createdAt: Timestamp }
  ): Promise<AuditEvent>;
}

export interface JobQueue {
  enqueue(input: { type: string; payload: Record<string, unknown> }): Promise<void>;
}

export interface RateLimitStore {
  consumeLimit(input: {
    key: string;
    windowSeconds: number;
    limit: number;
    now?: Timestamp;
  }): Promise<{ allowed: boolean; retryAfterMs: number }>;
}

export type LlmModelSelection = {
  model: string;
  route: "primary" | "fallback";
};

export interface LlmPort {
  streamChat(input: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    onModelResolved?: (selection: LlmModelSelection) => void;
  }): AsyncIterable<string>;
  completeChat(input: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    onModelResolved?: (selection: LlmModelSelection) => void;
  }): Promise<string>;
  embed(input: { text: string }): Promise<number[]>;
}

export interface TokenizerPort {
  countTokens(input: { text: string; model?: string }): number;
}

export interface Ports {
  clock: Clock;
  agents: AgentStore;
  sessions: SessionStore;
  transcripts: TranscriptStore;
  memory: MemoryStore;
  usage: UsageStore;
  audit: AuditStore;
  jobs: JobQueue;
  rateLimit?: RateLimitStore;
  llm: LlmPort;
  tokenizer?: TokenizerPort;
}

export interface Services {
  ports: Ports;
  agent: ReturnType<typeof import("../usecases/agent").createAgentService>;
  session: ReturnType<typeof import("../usecases/session").createSessionService>;
  transcript: ReturnType<typeof import("../usecases/transcript").createTranscriptService>;
  memory: ReturnType<typeof import("../usecases/memory").createMemoryService>;
  compaction: ReturnType<typeof import("../usecases/compaction").createCompactionService>;
  chat: ReturnType<typeof import("../usecases/chat").createChatService>;
}
