import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionStore } from "@daemon/domain";
import type { Session } from "@daemon/domain";

const mapSession = (row: any): Session => ({
  id: row.id,
  agentId: row.agent_id,
  sessionKey: row.session_key,
  createdAt: row.created_at,
  lastActiveAt: row.last_active_at,
});

export function createSessionStore(client: SupabaseClient): SessionStore {
  return {
    async getCurrentSession({ agentId, sessionKey }) {
      const { data, error } = await client
        .from("sessions")
        .select("*")
        .eq("agent_id", agentId)
        .eq("session_key", sessionKey)
        .eq("current", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data ? mapSession(data) : null;
    },

    async createSession({ agentId, sessionKey, now }) {
      const { data, error } = await client
        .from("sessions")
        .insert({
          agent_id: agentId,
          session_key: sessionKey,
          current: true,
          created_at: now,
          last_active_at: now,
        })
        .select("*")
        .single();

      if (error) throw error;
      return mapSession(data);
    },

    async touchSession({ sessionId, lastActiveAt }) {
      const { error } = await client
        .from("sessions")
        .update({ last_active_at: lastActiveAt })
        .eq("id", sessionId);

      if (error) throw error;
    },
  };
}
