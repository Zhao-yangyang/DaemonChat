import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  accessToken?: string;
}

export function createSupabaseClient(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: config.accessToken
      ? {
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
          },
        }
      : undefined,
  });
}
