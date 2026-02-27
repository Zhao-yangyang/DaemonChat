import type { SupabaseClient } from "@supabase/supabase-js";
import type { RateLimitStore } from "@daemon/domain";

type ConsumeResultRow = {
  allowed: boolean;
  retry_after_ms: number | null;
};

export function createRateLimitStore(client: SupabaseClient): RateLimitStore {
  return {
    async consumeLimit(input) {
      const now = input.now ?? new Date().toISOString();
      const { data, error } = await client.rpc("consume_chat_rate_limit", {
        p_key: input.key,
        p_window_seconds: input.windowSeconds,
        p_limit: input.limit,
        p_now: now,
      });
      if (error) throw error;

      const row = ((data ?? [])[0] ?? null) as ConsumeResultRow | null;
      if (!row) {
        return { allowed: false, retryAfterMs: 1000 };
      }
      return {
        allowed: row.allowed,
        retryAfterMs: row.retry_after_ms ?? 0,
      };
    },
  };
}
