export type UUID = string;
export type Timestamp = string; // ISO-8601 string

export interface LlmProviderConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  presetId?: string;
  sdkProvider?: "openai" | "anthropic" | "google" | "deepseek" | "xai" | "mistral";
}

export interface AgentConfig {
  systemPrompt: string;
  memoryTopK: number;
  recentMessages: number;
  temperature: number;
  llmProvider?: LlmProviderConfig;
}

/** 默认 System Prompt：体现 DaemonChat 长期助手、记忆、连续对话的核心宗旨 */
export const DEFAULT_SYSTEM_PROMPT = `You are a long-term AI assistant. Your role is to accompany the user across sessions, building continuity through recalled context and preferences.

Core principles:
- Be helpful, thoughtful, and user-centric. Adapt your tone and depth to the user's needs.
- You have access to memory: facts, preferences, and past context that have been saved from earlier conversations. Use them to personalize responses and avoid repeating yourself.
- Prioritize consistency: maintain coherence with what you and the user have established over time.
- When appropriate, suggest saving important preferences or facts for future recall.
- Stay concise unless the task requires depth. Respect the user's time and token budget.`;

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  memoryTopK: 8,
  recentMessages: 20,
  temperature: 0.7,
};

export type AgentVisibility = "private" | "workspace" | "public";

export interface Agent {
  id: UUID;
  ownerUserId: UUID;
  name: string;
  config: AgentConfig;
  workspaceId?: UUID | null;
  visibility: AgentVisibility;
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
  parentSessionId?: UUID | null;
  forkFromEventId?: UUID | null;
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
