import {
  createSupabaseClient,
  createAgentStore,
  createSessionStore,
  createTranscriptStore,
  createMemoryStore,
  createUsageStore,
  createAuditStore,
  createRateLimitStore,
} from "@daemon/adapters-supabase";
import { createJobQueue } from "@daemon/adapters-queue";
import { createVercelLlmAdapter } from "@daemon/adapters-llm-vercel";
import { createServices } from "@daemon/domain";
import { createOpenAiTokenizerPort } from "./tokenizer";

export interface WebEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  OPENAI_MODEL: string;
  OPENAI_FALLBACK_MODEL?: string;
  OPENAI_EMBED_MODEL: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  LLM_PROVIDER_NAME?: string;
  LLM_COMPATIBILITY?: "strict" | "compatible";
  EMBEDDING_MODE?: "remote" | "local";
  ALLOW_LOCAL_EMBEDDING_FALLBACK?: string;
  LOCAL_EMBED_DIMENSIONS?: string;
}

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : fallback;
};

const isTruthy = (value: string | undefined): boolean =>
  value === "1" || value === "true" || value === "yes";

export function createRawSupabaseClient(env: WebEnv, accessToken?: string) {
  return createSupabaseClient({
    url: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    accessToken,
  });
}

export function createContainer(env: WebEnv, accessToken?: string) {
  const supabase = createSupabaseClient({
    url: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    accessToken,
  });

  const ports = {
    clock: { now: () => new Date().toISOString() },
    agents: createAgentStore(supabase),
    sessions: createSessionStore(supabase),
    transcripts: createTranscriptStore(supabase),
    memory: createMemoryStore(supabase),
    usage: createUsageStore(supabase),
    audit: createAuditStore(supabase),
    rateLimit: createRateLimitStore(supabase),
    jobs: createJobQueue(supabase),
    tokenizer: createOpenAiTokenizerPort(env.OPENAI_MODEL),
    llm: createVercelLlmAdapter({
      model: env.OPENAI_MODEL,
      fallbackModel: env.OPENAI_FALLBACK_MODEL,
      embeddingModel: env.OPENAI_EMBED_MODEL,
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL,
      providerName: env.LLM_PROVIDER_NAME,
      compatibility: env.LLM_COMPATIBILITY,
      embeddingMode: env.EMBEDDING_MODE,
      allowLocalEmbeddingFallback: isTruthy(env.ALLOW_LOCAL_EMBEDDING_FALLBACK),
      embeddingDimensions: toPositiveInt(env.LOCAL_EMBED_DIMENSIONS, 1536),
    }),
  };

  return createServices(ports);
}
