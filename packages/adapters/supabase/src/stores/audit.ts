import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditStore, AuditEvent } from "@daemon/domain";

interface AuditEventRow {
  id: string;
  tenant_id: string;
  agent_id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

const mapAudit = (row: AuditEventRow): AuditEvent => ({
  id: row.id,
  tenantId: row.tenant_id,
  agentId: row.agent_id,
  eventType: row.event_type,
  payload: row.payload ?? {},
  createdAt: row.created_at,
});

export function createAuditStore(client: SupabaseClient): AuditStore {
  return {
    async insertAuditEvent(input) {
      const { data, error } = await client
        .from("audit_events")
        .insert({
          tenant_id: input.tenantId,
          agent_id: input.agentId,
          event_type: input.eventType,
          payload: input.payload,
          created_at: input.createdAt,
        })
        .select("*")
        .single();

      if (error) throw error;
      return mapAudit(data);
    },
  };
}
