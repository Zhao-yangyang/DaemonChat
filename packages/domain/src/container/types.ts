import type {
  Agent,
  AuditEvent,
  MemoryItem,
  Session,
  TranscriptEvent,
  UsageEvent,
  UUID,
  Timestamp,
} from "../types";

export interface Clock {
  now(): Timestamp;
}

export interface AgentStore {
  createAgent(input: { ownerUserId: UUID; name: string; now: Timestamp }): Promise<Agent>;
  getAgentById(agentId: UUID): Promise<Agent | null>;
  listAgentsByOwner(ownerUserId: UUID): Promise<Agent[]>;
}

export interface SessionStore {
  getCurrentSession(input: { agentId: UUID; sessionKey: string }): Promise<Session | null>;
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
}

export interface MemoryStore {
  insertMemoryItem(
    input: Omit<MemoryItem, "id" | "createdAt" | "updatedAt"> & {
      now: Timestamp;
    }
  ): Promise<MemoryItem>;
  queryTopK(input: {
    agentId: UUID;
    embedding: number[];
    topK: number;
    sensitivity?: MemoryItem["sensitivity"][];
    contextEligible?: boolean;
  }): Promise<MemoryItem[]>;
}

export interface UsageStore {
  insertUsageEvent(
    input: Omit<UsageEvent, "id" | "createdAt"> & { createdAt: Timestamp }
  ): Promise<UsageEvent>;
}

export interface AuditStore {
  insertAuditEvent(
    input: Omit<AuditEvent, "id" | "createdAt"> & { createdAt: Timestamp }
  ): Promise<AuditEvent>;
}

export interface JobQueue {
  enqueue(input: { type: string; payload: Record<string, unknown> }): Promise<void>;
}

export interface LlmPort {
  streamChat(input: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  }): AsyncIterable<string>;
  completeChat(input: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  }): Promise<string>;
  embed(input: { text: string }): Promise<number[]>;
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
  llm: LlmPort;
}

export interface Services {
  ports: Ports;
}
