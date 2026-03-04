export type UUID = string;
export type Timestamp = string; // ISO-8601 string

export interface LlmProviderConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  embeddingModel?: string;
  providerName?: string;
  presetId?: string;
  sdkProvider?: "openai" | "anthropic" | "google" | "deepseek" | "xai" | "mistral";
}

export interface AgentConfig {
  systemPrompt: string;
  model: string;
  memoryTopK: number;
  recentMessages: number;
  temperature: number;
  llmProvider?: LlmProviderConfig;
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
  workspaceId?: UUID | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export interface Workspace {
  id: UUID;
  name: string;
  slug: string;
  ownerUserId: UUID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface WorkspaceMember {
  id: UUID;
  workspaceId: UUID;
  userId: UUID;
  role: WorkspaceRole;
  invitedBy: UUID | null;
  createdAt: Timestamp;
}

export interface Session {
  id: UUID;
  agentId: UUID;
  sessionKey: string;
  displayName: string | null;
  isArchived: boolean;
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

export type ContextContentPart =
  | { type: "text"; text: string }
  | { type: "image"; url: string; mimeType?: string };

export interface ContextMessage {
  role: ContextRole;
  content: string | ContextContentPart[];
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
