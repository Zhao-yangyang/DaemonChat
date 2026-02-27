type MemorySensitivityFilter = "all" | "public" | "private" | "secret";
type MemoryEligibilityFilter = "all" | "eligible" | "ineligible";

export interface MemoryQueryState {
  agentId: string;
  query: string;
  sensitivityFilter: MemorySensitivityFilter;
  eligibilityFilter: MemoryEligibilityFilter;
  page: number;
}

type TranscriptTypeFilter =
  | "all"
  | "user_message"
  | "assistant_message"
  | "tool_call"
  | "compaction"
  | "memory_flush"
  | "system";

export interface TranscriptQueryState {
  agentId: string;
  sessionId: string;
  query: string;
  typeFilter: TranscriptTypeFilter;
  limit: number;
  page: number;
}

type UsagePeriod = "day" | "month";

export interface UsageQueryState {
  agentId: string;
  period: UsagePeriod;
}

const isMemorySensitivityFilter = (value: string): value is MemorySensitivityFilter =>
  value === "all" || value === "public" || value === "private" || value === "secret";

const isMemoryEligibilityFilter = (value: string): value is MemoryEligibilityFilter =>
  value === "all" || value === "eligible" || value === "ineligible";

const isTranscriptTypeFilter = (value: string): value is TranscriptTypeFilter =>
  value === "all" ||
  value === "user_message" ||
  value === "assistant_message" ||
  value === "tool_call" ||
  value === "compaction" ||
  value === "memory_flush" ||
  value === "system";

const isUsagePeriod = (value: string): value is UsagePeriod =>
  value === "day" || value === "month";

const parsePositiveInt = (value: string | null, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
};

export function parseMemoryQueryState(
  params: Pick<URLSearchParams, "get">
): MemoryQueryState {
  const sensitivityRaw = params.get("sensitivity") ?? "all";
  const eligibilityRaw = params.get("eligibility") ?? "all";

  return {
    agentId: params.get("agent") ?? "",
    query: params.get("q") ?? "",
    sensitivityFilter: isMemorySensitivityFilter(sensitivityRaw) ? sensitivityRaw : "all",
    eligibilityFilter: isMemoryEligibilityFilter(eligibilityRaw) ? eligibilityRaw : "all",
    page: parsePositiveInt(params.get("page"), 1),
  };
}

export function toMemorySearchParams(state: MemoryQueryState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.agentId) params.set("agent", state.agentId);
  if (state.query) params.set("q", state.query);
  if (state.sensitivityFilter !== "all") params.set("sensitivity", state.sensitivityFilter);
  if (state.eligibilityFilter !== "all") params.set("eligibility", state.eligibilityFilter);
  if (state.page > 1) params.set("page", String(state.page));
  return params;
}

export function parseTranscriptQueryState(
  params: Pick<URLSearchParams, "get">
): TranscriptQueryState {
  const typeRaw = params.get("type") ?? "all";
  return {
    agentId: params.get("agent") ?? "",
    sessionId: params.get("session") ?? "",
    query: params.get("q") ?? "",
    typeFilter: isTranscriptTypeFilter(typeRaw) ? typeRaw : "all",
    limit: parsePositiveInt(params.get("limit"), 50),
    page: parsePositiveInt(params.get("page"), 1),
  };
}

export function toTranscriptSearchParams(
  state: TranscriptQueryState
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.agentId) params.set("agent", state.agentId);
  if (state.sessionId) params.set("session", state.sessionId);
  if (state.query) params.set("q", state.query);
  if (state.typeFilter !== "all") params.set("type", state.typeFilter);
  if (state.limit !== 50) params.set("limit", String(state.limit));
  if (state.page > 1) params.set("page", String(state.page));
  return params;
}

export function parseUsageQueryState(
  params: Pick<URLSearchParams, "get">
): UsageQueryState {
  const periodRaw = params.get("period") ?? "day";
  return {
    agentId: params.get("agent") ?? "",
    period: isUsagePeriod(periodRaw) ? periodRaw : "day",
  };
}

export function toUsageSearchParams(state: UsageQueryState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.agentId) params.set("agent", state.agentId);
  if (state.period !== "day") params.set("period", state.period);
  return params;
}
