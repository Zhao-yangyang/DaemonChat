import {
  createSupabaseClient,
  createMemoryStore,
  createTranscriptStore,
} from "@daemon/adapters-supabase";

export interface WorkerEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export function createWorkerContainer(env: WorkerEnv) {
  const client = createSupabaseClient({
    url: env.SUPABASE_URL,
    anonKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const transcriptStore = createTranscriptStore(client);
  const memoryStore = createMemoryStore(client);
  const clock = { now: () => new Date().toISOString() };

  // We no longer create domain services here since they require a per-agent LLM.
  // We return the raw stores and clock so the job handler can create services dynamically.

  return { client, transcriptStore, memoryStore, clock };
}
