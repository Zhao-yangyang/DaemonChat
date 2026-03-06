import {
  createSupabaseClient,
  createAgentStore,
  createWorkspaceStore,
  createSessionStore,
  createTranscriptStore,
  createMemoryStore,
  createUsageStore,
  createAuditStore,
  createRateLimitStore,
} from "@daemon/adapters-supabase";
import { createJobQueue } from "@daemon/adapters-queue";
import { createDeterministicLocalEmbedding } from "@daemon/adapters-llm-vercel";
import { createServices } from "@daemon/domain";
import type { LlmPort } from "@daemon/domain";
import { createOpenAiTokenizerPort } from "./tokenizer";

export interface WebEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

export function createRawSupabaseClient(env: WebEnv, accessToken?: string) {
  return createSupabaseClient({
    url: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    accessToken,
  });
}

/**
 * A stub LLM port used when no per-agent LLM is available yet.
 * The real LLM is created dynamically per-request based on Agent config.
 */
const stubLlm: LlmPort = {
  async *streamChat() {
    throw new Error("LLM not configured — use per-agent LLM Provider");
  },
  async completeChat() {
    throw new Error("LLM not configured — use per-agent LLM Provider");
  },
  async embed({ text }) {
    return createDeterministicLocalEmbedding(text, 1536);
  },
};

export function createContainer(env: WebEnv, accessToken?: string) {
  const supabase = createSupabaseClient({
    url: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    accessToken,
  });

  const ports = {
    clock: { now: () => new Date().toISOString() },
    agents: createAgentStore(supabase),
    workspace: createWorkspaceStore(supabase),
    sessions: createSessionStore(supabase),
    transcripts: createTranscriptStore(supabase),
    memory: createMemoryStore(supabase),
    usage: createUsageStore(supabase),
    audit: createAuditStore(supabase),
    rateLimit: createRateLimitStore(supabase),
    jobs: createJobQueue(supabase),
    tokenizer: createOpenAiTokenizerPort(),
    llm: stubLlm,
  };

  return createServices(ports);
}
