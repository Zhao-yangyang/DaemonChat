const toPositiveInt = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
};

export function calculateRetryDelayMs(input: {
  attempt: number;
  baseDelayMs: number;
  maxDelayMs: number;
}): number {
  const attempt = toPositiveInt(input.attempt, 1);
  const baseDelayMs = toPositiveInt(input.baseDelayMs, 1);
  const maxDelayMs = Math.max(baseDelayMs, toPositiveInt(input.maxDelayMs, baseDelayMs));
  const exponentialDelay = baseDelayMs * 2 ** (attempt - 1);
  if (!Number.isFinite(exponentialDelay)) return maxDelayMs;
  return Math.min(maxDelayMs, Math.max(1, Math.floor(exponentialDelay)));
}

export function resolveRetryState(input: {
  currentAttempts: number;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  nowMs?: number;
}): {
  attempts: number;
  shouldDeadLetter: boolean;
  retryDelayMs: number;
  runAtIso: string;
} {
  const attempts = Math.max(0, Math.floor(input.currentAttempts)) + 1;
  const maxAttempts = toPositiveInt(input.maxAttempts, 1);
  const shouldDeadLetter = attempts >= maxAttempts;
  const retryDelayMs = shouldDeadLetter
    ? 0
    : calculateRetryDelayMs({
        attempt: attempts,
        baseDelayMs: input.baseDelayMs,
        maxDelayMs: input.maxDelayMs,
      });
  const nowMs = input.nowMs ?? Date.now();

  return {
    attempts,
    shouldDeadLetter,
    retryDelayMs,
    runAtIso: new Date(nowMs + retryDelayMs).toISOString(),
  };
}
