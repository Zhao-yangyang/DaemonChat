import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemoryStore, MemoryItem } from "@daemon/domain";

const mapMemory = (row: any): MemoryItem => ({
  id: row.id,
  agentId: row.agent_id,
  scopeType: row.scope_type,
  scopeId: row.scope_id,
  type: row.type,
  content: row.content,
  tags: row.tags ?? [],
  sensitivity: row.sensitivity,
  contextEligible: row.context_eligible,
  embedding: row.embedding ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function createMemoryStore(client: SupabaseClient): MemoryStore {
  return {
    async insertMemoryItem(input) {
      const { data, error } = await client
        .from("memory_items")
        .insert({
          agent_id: input.agentId,
          scope_type: input.scopeType,
          scope_id: input.scopeId,
          type: input.type,
          content: input.content,
          tags: input.tags,
          sensitivity: input.sensitivity,
          context_eligible: input.contextEligible,
          embedding: input.embedding,
          created_at: input.now,
          updated_at: input.now,
        })
        .select("*")
        .single();

      if (error) throw error;
      return mapMemory(data);
    },

    async listMemoryItems({ agentId, limit }) {
      const { data, error } = await client
        .from("memory_items")
        .select("*")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapMemory);
    },

    async queryTopK({ agentId, embedding, topK, sensitivity, contextEligible }) {
      const { data, error } = await client.rpc("match_memory_items", {
        query_embedding: embedding,
        match_count: topK,
        filter_agent_id: agentId,
        filter_sensitivity: sensitivity ?? null,
        filter_context_eligible: contextEligible ?? null,
      });

      if (error) throw error;
      return (data ?? []).map(mapMemory);
    },
  };
}
