import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsageStore, UsageEvent, UsageSummary, UsageEventType } from "@daemon/domain";

interface UsageEventRow {
  id: string;
  agent_id: string;
  event_type: string;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_estimate: number | string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

const mapUsage = (row: UsageEventRow): UsageEvent => ({
  id: row.id,
  agentId: row.agent_id,
  eventType: row.event_type as UsageEventType,
  tokensIn: row.tokens_in,
  tokensOut: row.tokens_out,
  costEstimate: row.cost_estimate != null ? Number(row.cost_estimate) : null,
  meta: row.meta ?? {},
  createdAt: row.created_at,
});

const toBucketStart = (value: string, bucket: "hour" | "day"): string => {
  const date = new Date(value);
  if (bucket === "hour") {
    date.setMinutes(0, 0, 0);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date.toISOString();
};

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

    async seriesUsage({ agentId, from, to, bucket }) {
      const { data, error } = await client
        .from("usage_events")
        .select("tokens_in,tokens_out,cost_estimate,created_at")
        .eq("agent_id", agentId)
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const buckets = new Map<
        string,
        {
          tokensIn: number;
          tokensOut: number;
          costEstimate: number;
        }
      >();

      for (const row of data ?? []) {
        const bucketStart = toBucketStart(row.created_at, bucket);
        const current = buckets.get(bucketStart) ?? {
          tokensIn: 0,
          tokensOut: 0,
          costEstimate: 0,
        };
        current.tokensIn += row.tokens_in ?? 0;
        current.tokensOut += row.tokens_out ?? 0;
        current.costEstimate += Number(row.cost_estimate ?? 0);
        buckets.set(bucketStart, current);
      }

      return [...buckets.entries()].map(([bucketStart, point]) => ({
        bucketStart,
        tokensIn: point.tokensIn,
        tokensOut: point.tokensOut,
        costEstimate: point.costEstimate,
      }));
    },
  };
}
