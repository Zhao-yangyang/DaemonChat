import type { RateLimitStore } from "@daemon/domain";
type EnvLike = Record<string, string | undefined>;

export type ChatRateLimits = {
  qps?: number;
  qpm?: number;
};

const parsePositiveInt = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
};

export const resolveChatRateLimits = (env: EnvLike): ChatRateLimits => ({
  qps: parsePositiveInt(env.CHAT_QPS_LIMIT),
  qpm: parsePositiveInt(env.CHAT_QPM_LIMIT),
});

const pruneTimestamps = (timestamps: number[], nowMs: number, windowMs: number): number[] =>
  timestamps.filter((value) => nowMs - value < windowMs);

export const createInMemoryChatRateLimiter = () => {
  const secondBuckets = new Map<string, number[]>();
  const minuteBuckets = new Map<string, number[]>();

  return {
    consume(input: {
      key: string;
      qps?: number;
      qpm?: number;
      nowMs?: number;
    }): { allowed: true } | { allowed: false; retryAfterMs: number } {
      const nowMs = input.nowMs ?? Date.now();
      const secWindowMs = 1_000;
      const minWindowMs = 60_000;
      const secHits = pruneTimestamps(secondBuckets.get(input.key) ?? [], nowMs, secWindowMs);
      const minHits = pruneTimestamps(minuteBuckets.get(input.key) ?? [], nowMs, minWindowMs);

      if (input.qps && secHits.length >= input.qps) {
        const oldest = secHits[0] ?? nowMs;
        return {
          allowed: false,
          retryAfterMs: Math.max(1, secWindowMs - (nowMs - oldest)),
        };
      }
      if (input.qpm && minHits.length >= input.qpm) {
        const oldest = minHits[0] ?? nowMs;
        return {
          allowed: false,
          retryAfterMs: Math.max(1, minWindowMs - (nowMs - oldest)),
        };
      }

      if (input.qps) {
        secondBuckets.set(input.key, [...secHits, nowMs]);
      } else if (secHits.length > 0) {
        secondBuckets.set(input.key, secHits);
      } else {
        secondBuckets.delete(input.key);
      }

      if (input.qpm) {
        minuteBuckets.set(input.key, [...minHits, nowMs]);
      } else if (minHits.length > 0) {
        minuteBuckets.set(input.key, minHits);
      } else {
        minuteBuckets.delete(input.key);
      }

      return { allowed: true };
    },

    reset() {
      secondBuckets.clear();
      minuteBuckets.clear();
    },
  };
};

export const chatRateLimiter = createInMemoryChatRateLimiter();

const consumeSingleWindow = async (input: {
  store?: RateLimitStore;
  fallback: ReturnType<typeof createInMemoryChatRateLimiter>;
  key: string;
  windowSeconds: number;
  limit: number;
}): Promise<{ allowed: boolean; retryAfterMs: number }> => {
  if (input.store) {
    try {
      return await input.store.consumeLimit({
        key: input.key,
        windowSeconds: input.windowSeconds,
        limit: input.limit,
      });
    } catch {
      // fall through to process-local limiter
    }
  }

  const fallbackResult = input.fallback.consume({
    key: input.key,
    qps: input.windowSeconds === 1 ? input.limit : undefined,
    qpm: input.windowSeconds === 60 ? input.limit : undefined,
  });
  if (fallbackResult.allowed) {
    return { allowed: true, retryAfterMs: 0 };
  }
  return fallbackResult;
};

export const consumeChatRateLimit = async (input: {
  store?: RateLimitStore;
  key: string;
  qps?: number;
  qpm?: number;
}): Promise<{ allowed: true } | { allowed: false; retryAfterMs: number }> => {
  if (!input.qps && !input.qpm) {
    return { allowed: true };
  }

  if (input.qps) {
    const second = await consumeSingleWindow({
      store: input.store,
      fallback: chatRateLimiter,
      key: input.key,
      windowSeconds: 1,
      limit: input.qps,
    });
    if (!second.allowed) {
      return { allowed: false, retryAfterMs: second.retryAfterMs };
    }
  }

  if (input.qpm) {
    const minute = await consumeSingleWindow({
      store: input.store,
      fallback: chatRateLimiter,
      key: input.key,
      windowSeconds: 60,
      limit: input.qpm,
    });
    if (!minute.allowed) {
      return { allowed: false, retryAfterMs: minute.retryAfterMs };
    }
  }

  return { allowed: true };
};
