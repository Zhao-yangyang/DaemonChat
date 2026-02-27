import type { SupabaseClient } from "@supabase/supabase-js";
import type { TranscriptStore } from "@daemon/domain";
import type { TranscriptEvent } from "@daemon/domain";

const mapEvent = (row: any): TranscriptEvent => ({
  id: row.id,
  agentId: row.agent_id,
  sessionId: row.session_id,
  requestId: row.request_id ?? null,
  type: row.type,
  content: row.content,
  tokensIn: row.tokens_in,
  tokensOut: row.tokens_out,
  createdAt: row.created_at,
});

export function createTranscriptStore(client: SupabaseClient): TranscriptStore {
  return {
    async appendEvent({
      agentId,
      sessionId,
      requestId,
      type,
      content,
      tokensIn,
      tokensOut,
      createdAt,
    }) {
      const { data, error } = await client
        .from("transcript_events")
        .insert({
          agent_id: agentId,
          session_id: sessionId,
          request_id: requestId ?? null,
          type,
          content,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          created_at: createdAt,
        })
        .select("*")
        .single();

      if (error) throw error;
      return mapEvent(data);
    },

    async listRecentEvents({ agentId, sessionId, limit }) {
      const { data, error } = await client
        .from("transcript_events")
        .select("*")
        .eq("agent_id", agentId)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      const events = (data ?? []).map(mapEvent).reverse();
      return events;
    },

    async getLatestCompaction({ agentId, sessionId }) {
      const { data, error } = await client
        .from("transcript_events")
        .select("*")
        .eq("agent_id", agentId)
        .eq("session_id", sessionId)
        .eq("type", "compaction")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data ? mapEvent(data) : null;
    },

    async listEventsByRequestId({ agentId, sessionId, requestId }) {
      const { data, error } = await client
        .from("transcript_events")
        .select("*")
        .eq("agent_id", agentId)
        .eq("session_id", sessionId)
        .eq("request_id", requestId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapEvent);
    },
  };
}
