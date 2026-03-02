import {
  createSupabaseClient,
  createMemoryStore,
  createTranscriptStore,
} from "@daemon/adapters-supabase";
import { createVercelLlmAdapter } from "@daemon/adapters-llm-vercel";
import { createMemoryExtractionService } from "@daemon/domain";

export interface WorkerEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  OPENAI_MODEL?: string;
  OPENAI_EMBED_MODEL?: string;
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

export function createWorkerContainer(env: WorkerEnv) {
  const client = createSupabaseClient({
    url: env.SUPABASE_URL,
    anonKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const llm = createVercelLlmAdapter({
    model: env.OPENAI_MODEL ?? "gpt-4o-mini",
    embeddingModel: env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small",
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
    providerName: env.LLM_PROVIDER_NAME,
    compatibility: env.LLM_COMPATIBILITY,
    embeddingMode: env.EMBEDDING_MODE,
    allowLocalEmbeddingFallback: isTruthy(env.ALLOW_LOCAL_EMBEDDING_FALLBACK),
    embeddingDimensions: toPositiveInt(env.LOCAL_EMBED_DIMENSIONS, 1536),
  });

  const memoryExtraction = createMemoryExtractionService({
    transcripts: createTranscriptStore(client),
    memory: createMemoryStore(client),
    llm,
    clock: { now: () => new Date().toISOString() },
  });

  return { client, memoryExtraction };
}
