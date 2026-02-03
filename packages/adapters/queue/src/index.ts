import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobQueue } from "@daemon/domain";

export function createJobQueue(client: SupabaseClient): JobQueue {
  return {
    async enqueue(input) {
      const { error } = await client.from("jobs").insert({
        type: input.type,
        payload: input.payload,
        status: "queued",
      });

      if (error) throw error;
    },
  };
}
