import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsageStore, UsageEvent, UsageSummary } from "@daemon/domain";

const mapUsage = (row: any): UsageEvent => ({
  id: row.id,
  agentId: row.agent_id,
  eventType: row.event_type,
  tokensIn: row.tokens_in,
  tokensOut: row.tokens_out,
  costEstimate: row.cost_estimate,
  meta: row.meta ?? {},
  createdAt: row.created_at,
});

export function createUsageStore(client: SupabaseClient): UsageStore {
  return {
    async insertUsageEvent(input) {
      const { data, error } = await client
        .from("usage_events")
        .insert({
          agent_id: input.agentId,
          event_type: input.eventType,
          tokens_in: input.tokensIn,
          tokens_out: input.tokensOut,
          cost_estimate: input.costEstimate,
          meta: input.meta,
          created_at: input.createdAt,
        })
        .select("*")
        .single();

      if (error) throw error;
      return mapUsage(data);
    },

    async sumUsage({ agentId, from, to }) {
      const { data, error } = await client
        .from("usage_events")
        .select("tokens_in,tokens_out,cost_estimate")
        .eq("agent_id", agentId)
        .gte("created_at", from)
        .lte("created_at", to);

      if (error) throw error;
      return (data ?? []).reduce<UsageSummary>(
        (acc, row) => {
          acc.tokensIn += row.tokens_in ?? 0;
          acc.tokensOut += row.tokens_out ?? 0;
          acc.costEstimate += Number(row.cost_estimate ?? 0);
          return acc;
        },
        { tokensIn: 0, tokensOut: 0, costEstimate: 0 }
      );
    },
  };
}
