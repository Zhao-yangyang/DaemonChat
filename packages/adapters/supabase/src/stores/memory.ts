import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemoryStore, MemoryItem, MemoryScopeType, MemoryType, MemorySensitivity } from "@daemon/domain";

interface MemoryItemRow {
  id: string;
  agent_id: string;
  scope_type: string;
  scope_id: string;
  type: string;
  content: string;
  tags: string[] | null;
  sensitivity: string;
  context_eligible: boolean;
  embedding: number[] | null;
  created_at: string;
  updated_at: string;
}

const mapMemory = (row: MemoryItemRow): MemoryItem => ({
  id: row.id,
  agentId: row.agent_id,
  scopeType: row.scope_type as MemoryScopeType,
  scopeId: row.scope_id,
  type: row.type as MemoryType,
  content: row.content,
  tags: row.tags ?? [],
  sensitivity: row.sensitivity as MemorySensitivity,
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

    async listMemoryItems({ agentId, limit, offset, type, sensitivity }) {
      let query = client
        .from("memory_items")
        .select("*")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (offset) query = query.range(offset, offset + limit - 1);
      if (type) query = query.eq("type", type);
      if (sensitivity) query = query.eq("sensitivity", sensitivity);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(mapMemory);
    },

    async countMemoryItems({ agentId }) {
      const { data, error } = await client.rpc("count_memory_items_by_type", {
        p_agent_id: agentId,
      });

      if (error) throw error;
      const rows = (data ?? []) as Array<{ type: string; cnt: number }>;
      const byType: Record<string, number> = {};
      let total = 0;
      for (const row of rows) {
        byType[row.type] = row.cnt;
        total += row.cnt;
      }
      return { total, byType };
    },

    async queryTopK({
      agentId,
      embedding,
      topK,
      sensitivity,
      contextEligible,
      scopeType,
      scopeId,
    }) {
      const { data, error } = await client.rpc("match_memory_items", {
        query_embedding: embedding,
        match_count: topK,
        filter_agent_id: agentId,
        filter_sensitivity: sensitivity ?? null,
        filter_context_eligible: contextEligible ?? null,
        filter_scope_type: scopeType ?? null,
        filter_scope_id: scopeId ?? null,
      });

      if (error) throw error;
      return (data ?? []).map(mapMemory);
    },

    async updateMemoryItem({ agentId, id, content, tags, sensitivity, contextEligible, embedding, now }) {
      const updates: Record<string, unknown> = {
        updated_at: now,
      };
      if (content !== undefined) updates.content = content;
      if (tags !== undefined) updates.tags = tags;
      if (sensitivity !== undefined) updates.sensitivity = sensitivity;
      if (contextEligible !== undefined) updates.context_eligible = contextEligible;
      if (embedding !== undefined) updates.embedding = embedding;

      const { data, error } = await client
        .from("memory_items")
        .update(updates)
        .eq("id", id)
        .eq("agent_id", agentId)
        .select("*")
        .single();
      if (error) throw error;
      return mapMemory(data);
    },

    async deleteMemoryItem({ agentId, id }) {
      const { error } = await client
        .from("memory_items")
        .delete()
        .eq("id", id)
        .eq("agent_id", agentId);
      if (error) throw error;
    },
  };
}
