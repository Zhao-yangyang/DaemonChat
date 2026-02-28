import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_AGENT_CONFIG, type Agent, type AgentConfig } from "@daemon/domain";
import type { AgentStore } from "@daemon/domain";

const mapAgent = (row: any): Agent => ({
  id: row.id,
  ownerUserId: row.owner_user_id,
  name: row.name,
  config: { ...DEFAULT_AGENT_CONFIG, ...(row.config ?? {}) } as AgentConfig,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function createAgentStore(client: SupabaseClient): AgentStore {
  return {
    async createAgent({ ownerUserId, name, config, now }) {
      const { data, error } = await client
        .from("agents")
        .insert({ owner_user_id: ownerUserId, name, config, created_at: now, updated_at: now })
        .select("*")
        .single();

      if (error) throw error;
      return mapAgent(data);
    },

    async getAgentById(agentId) {
      const { data, error } = await client
        .from("agents")
        .select("*")
        .eq("id", agentId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapAgent(data) : null;
    },

    async listAgentsByOwner(ownerUserId) {
      const { data, error } = await client
        .from("agents")
        .select("*")
        .eq("owner_user_id", ownerUserId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapAgent);
    },

    async updateAgent({ agentId, name, config, now }) {
      const updates: Record<string, unknown> = { updated_at: now };
      if (name !== undefined) updates.name = name;
      if (config !== undefined) {
        const { data: existing } = await client.from("agents").select("config").eq("id", agentId).single();
        updates.config = { ...(existing?.config ?? {}), ...config };
      }
      const { data, error } = await client
        .from("agents")
        .update(updates)
        .eq("id", agentId)
        .select("*")
        .single();
      if (error) throw error;
      return mapAgent(data);
    },
  };
}
