import { createSupabaseClient } from "@daemon/adapters-supabase";

export interface WorkerEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export function createWorkerContainer(env: WorkerEnv) {
  const client = createSupabaseClient({
    url: env.SUPABASE_URL,
    anonKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });

  return { client };
}
