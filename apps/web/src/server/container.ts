import {
  createSupabaseClient,
  createAgentStore,
  createSessionStore,
  createTranscriptStore,
  createMemoryStore,
  createUsageStore,
  createAuditStore,
} from "@daemon/adapters-supabase";
import { createJobQueue } from "@daemon/adapters-queue";
import { createVercelLlmAdapter } from "@daemon/adapters-llm-vercel";
import { createServices } from "@daemon/domain";

export interface WebEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  OPENAI_MODEL: string;
  OPENAI_EMBED_MODEL: string;
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
    jobs: createJobQueue(supabase),
    llm: createVercelLlmAdapter({
      model: env.OPENAI_MODEL,
      embeddingModel: env.OPENAI_EMBED_MODEL,
    }),
  };

  return createServices(ports);
}
