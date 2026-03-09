import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionStore } from "@daemon/domain";
import type { Session } from "@daemon/domain";

const mapSession = (row: any): Session => ({
  id: row.id,
  agentId: row.agent_id,
  sessionKey: row.session_key,
  displayName: row.display_name ?? null,
  isArchived: Boolean(row.is_archived),
  createdAt: row.created_at,
  lastActiveAt: row.last_active_at,
  parentSessionId: row.parent_session_id ?? null,
  forkFromEventId: row.fork_from_event_id ?? null,
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

    async listRecentSessions({ agentId, limit, includeArchived }) {
      let query = client
        .from("sessions")
        .select("*")
        .eq("agent_id", agentId)
        .order("last_active_at", { ascending: false })
        .limit(limit);

      if (!includeArchived) {
        query = query.eq("is_archived", false);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data ?? []).map(mapSession);
    },

    async getSessionById({ agentId, sessionId }) {
      const { data, error } = await client
        .from("sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("agent_id", agentId)
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

    async createForkedSession({ agentId, parentSessionId, forkFromEventId, now }) {
      const sessionKey = `fork-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const { data, error } = await client
        .from("sessions")
        .insert({
          agent_id: agentId,
          session_key: sessionKey,
          parent_session_id: parentSessionId,
          fork_from_event_id: forkFromEventId,
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

    async renameSession({ agentId, sessionId, displayName }) {
      const { error } = await client
        .from("sessions")
        .update({ display_name: displayName })
        .eq("id", sessionId)
        .eq("agent_id", agentId);
      if (error) throw error;
    },

    async deleteSession({ agentId, sessionId }) {
      const { error } = await client
        .from("sessions")
        .delete()
        .eq("id", sessionId)
        .eq("agent_id", agentId);
      if (error) throw error;
    },

    async archiveSession({ agentId, sessionId }) {
      const { error } = await client
        .from("sessions")
        .update({ is_archived: true })
        .eq("id", sessionId)
        .eq("agent_id", agentId);
      if (error) throw error;
    },

    async unarchiveSession({ agentId, sessionId }) {
      const { error } = await client
        .from("sessions")
        .update({ is_archived: false })
        .eq("id", sessionId)
        .eq("agent_id", agentId);
      if (error) throw error;
    },
  };
}
