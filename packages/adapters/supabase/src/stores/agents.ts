import type { SupabaseClient } from "@supabase/supabase-js";
import type { Agent } from "@daemon/domain";
import type { AgentStore } from "@daemon/domain";

const mapAgent = (row: any): Agent => ({
  id: row.id,
  ownerUserId: row.owner_user_id,
  name: row.name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function createAgentStore(client: SupabaseClient): AgentStore {
  return {
    async createAgent({ ownerUserId, name, now }) {
      const { data, error } = await client
        .from("agents")
        .insert({ owner_user_id: ownerUserId, name, created_at: now, updated_at: now })
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
  };
}
