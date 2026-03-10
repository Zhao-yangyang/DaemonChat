type EnvLike = Record<string, string | undefined>;

export type TokenHardCaps = {
  dailyTokens?: number;
  monthlyTokens?: number;
};

export type ChatBudget = {
  modelWindow: number;
  reserveOutputTokens: number;
  reserveToolTokens: number;
  memoryTopK: number;
  recentMessages: number;
};

export type ChatBudgetDegradePolicy = {
  enabled: boolean;
  reserveOutputTokens: number;
  memoryTopK: number;
  recentMessages: number;
};

const parsePositiveInt = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
};

const parseBoolean = (value: string | undefined): boolean =>
  value === "1" || value === "true" || value === "yes";

const clampPositiveInt = (value: number | undefined, fallback: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
};

export const resolveTokenHardCaps = (env: EnvLike): TokenHardCaps => ({
  dailyTokens: parsePositiveInt(env.CHAT_DAILY_TOKEN_HARD_CAP),
  monthlyTokens: parsePositiveInt(env.CHAT_MONTHLY_TOKEN_HARD_CAP),
});

export const resolveChatMaxInputTokens = (env: EnvLike): number | undefined =>
  parsePositiveInt(env.CHAT_MAX_INPUT_TOKENS);

export const resolveChatBudgetDegradePolicy = (
  env: EnvLike,
  baseBudget: Pick<ChatBudget, "reserveOutputTokens" | "memoryTopK" | "recentMessages">,
): ChatBudgetDegradePolicy => {
  const defaultReserve = Math.min(baseBudget.reserveOutputTokens, 512);
  const defaultMemoryTopK = Math.max(1, Math.min(baseBudget.memoryTopK, 4));
  const defaultRecentMessages = Math.max(1, Math.min(baseBudget.recentMessages, 10));

  return {
    enabled: parseBoolean(env.CHAT_BUDGET_DEGRADE_ENABLED),
    reserveOutputTokens: clampPositiveInt(
      parsePositiveInt(env.CHAT_DEGRADE_RESERVE_OUTPUT_TOKENS),
      defaultReserve,
    ),
    memoryTopK: clampPositiveInt(parsePositiveInt(env.CHAT_DEGRADE_MEMORY_TOPK), defaultMemoryTopK),
    recentMessages: clampPositiveInt(
      parsePositiveInt(env.CHAT_DEGRADE_RECENT_MESSAGES),
      defaultRecentMessages,
    ),
  };
};

export const buildDegradedBudget = <T extends ChatBudget>(
  budget: T,
  policy: ChatBudgetDegradePolicy,
): { budget: T; degraded: boolean } => {
  const nextBudget = {
    ...budget,
    reserveOutputTokens: Math.min(budget.reserveOutputTokens, policy.reserveOutputTokens),
    memoryTopK: Math.min(budget.memoryTopK, policy.memoryTopK),
    recentMessages: Math.min(budget.recentMessages, policy.recentMessages),
  };

  const degraded =
    nextBudget.reserveOutputTokens !== budget.reserveOutputTokens ||
    nextBudget.memoryTopK !== budget.memoryTopK ||
    nextBudget.recentMessages !== budget.recentMessages;

  return {
    budget: nextBudget,
    degraded,
  };
};

export const getUsageWindow = (period: "day" | "month", now = new Date()) => {
  const to = new Date(now);
  const from = new Date(now);
  if (period === "day") {
    from.setHours(0, 0, 0, 0);
  } else {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  }
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
};

export const projectTotalTokens = (input: {
  usage: { tokensIn: number; tokensOut: number };
  incomingUserTokens: number;
  reserveOutputTokens: number;
}): number =>
  (input.usage.tokensIn ?? 0) +
  (input.usage.tokensOut ?? 0) +
  Math.max(0, input.incomingUserTokens) +
  Math.max(0, input.reserveOutputTokens);

export const wouldExceedTokenHardCap = (input: {
  cap: number;
  usage: { tokensIn: number; tokensOut: number };
  incomingUserTokens: number;
  reserveOutputTokens: number;
}): boolean => projectTotalTokens(input) > input.cap;

export const wouldExceedChatMaxInputTokens = (input: {
  incomingUserTokens: number;
  maxInputTokens: number;
}): boolean => Math.max(0, input.incomingUserTokens) > input.maxInputTokens;
