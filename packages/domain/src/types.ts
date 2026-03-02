export type UUID = string;
export type Timestamp = string; // ISO-8601 string

export interface AgentConfig {
  systemPrompt: string;
  model: string;
  memoryTopK: number;
  recentMessages: number;
  temperature: number;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  systemPrompt: "You are a helpful AI assistant.",
  model: "",
  memoryTopK: 8,
  recentMessages: 20,
  temperature: 0.7,
};

export interface Agent {
  id: UUID;
  ownerUserId: UUID;
  name: string;
  config: AgentConfig;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Session {
  id: UUID;
  agentId: UUID;
  sessionKey: string;
  displayName: string | null;
  createdAt: Timestamp;
  lastActiveAt: Timestamp;
}

export type TranscriptEventType =
  | "user_message"
  | "assistant_message"
  | "tool_call"
  | "compaction"
  | "memory_flush"
  | "system";

export interface TranscriptEvent {
  id: UUID;
  agentId: UUID;
  sessionId: UUID;
  requestId: string | null;
  type: TranscriptEventType;
  content: Record<string, unknown>;
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: Timestamp;
}

export type MemoryScopeType = "user" | "team" | "org";
export type MemoryType = "fact" | "rule" | "preference" | "task";
export type MemorySensitivity = "public" | "private" | "secret";

export interface MemoryItem {
  id: UUID;
  agentId: UUID;
  scopeType: MemoryScopeType;
  scopeId: UUID;
  type: MemoryType;
  content: string;
  tags: string[];
  sensitivity: MemorySensitivity;
  contextEligible: boolean;
  embedding: number[] | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type UsageEventType = "llm" | "tool" | "storage";

export interface UsageEvent {
  id: UUID;
  agentId: UUID;
  eventType: UsageEventType;
  tokensIn: number | null;
  tokensOut: number | null;
  costEstimate: number | null;
  meta: Record<string, unknown>;
  createdAt: Timestamp;
}

export interface UsageSummary {
  tokensIn: number;
  tokensOut: number;
  costEstimate: number;
}

export type UsageBucket = "hour" | "day";

export interface UsageSeriesPoint {
  bucketStart: Timestamp;
  tokensIn: number;
  tokensOut: number;
  costEstimate: number;
}

export type ContextRole = "system" | "user" | "assistant";

export interface ContextMessage {
  role: ContextRole;
  content: string;
}

export interface ContextBudget {
  modelWindow: number;
  reserveOutputTokens: number;
  reserveToolTokens: number;
  memoryTopK: number;
  recentMessages: number;
}

export interface ContextPack {
  system: string;
  constraints: string[];
  taskState: string | null;
  memoryTopK: MemoryItem[];
  recentMessages: TranscriptEvent[];
  userInput: string;
  messages: ContextMessage[];
  maxContextTokens: number;
  tokenEstimate: number;
  trimmed: { memory: boolean; recent: boolean };
  shouldCompact: boolean;
}

export interface AuditEvent {
  id: UUID;
  tenantId: UUID | null;
  agentId: UUID | null;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Timestamp;
}
