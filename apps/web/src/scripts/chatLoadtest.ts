type Result = {
  ok: boolean;
  status: number;
  totalMs: number;
  firstTokenMs: number | null;
  requestId: string | null;
  error?: string;
};

const env = process.env;

const required = (name: string): string => {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
};

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const toFloat = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx] ?? 0;
};

const randomId = () => crypto.randomUUID();

const parseSse = async (res: Response, startedAt: number): Promise<Pick<Result, "firstTokenMs" | "error">> => {
  const body = res.body;
  if (!body) {
    return { firstTokenMs: null, error: "empty response body" };
  }

  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  let firstTokenMs: number | null = null;
  let streamError: string | undefined;

  const handleBlock = (block: string) => {
    const line = block
      .split("\n")
      .find((entry) => entry.startsWith("data: "));
    if (!line) return;
    try {
      const payload = JSON.parse(line.slice(6)) as {
        type?: string;
        message?: string;
      };
      if (payload.type === "chunk" && firstTokenMs == null) {
        firstTokenMs = Date.now() - startedAt;
      }
      if (payload.type === "error") {
        streamError = payload.message ?? "stream error";
      }
    } catch {
      // ignore malformed blocks
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    blocks.forEach(handleBlock);
  }

  if (buffer.trim()) {
    handleBlock(buffer);
  }

  return { firstTokenMs, error: streamError };
};

const requestOnce = async (input: {
  baseUrl: string;
  accessToken: string;
  agentId: string;
  sessionKey: string;
  message: string;
}): Promise<Result> => {
  const idempotencyKey = randomId();
  const startedAt = Date.now();
  const res = await fetch(`${input.baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-access-token": input.accessToken,
      "x-idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({
      agentId: input.agentId,
      sessionKey: input.sessionKey,
      userInput: input.message,
      system: "You are a concise assistant.",
      idempotencyKey,
    }),
  });

  const requestId = res.headers.get("x-request-id");
  const status = res.status;
  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      status,
      totalMs: Date.now() - startedAt,
      firstTokenMs: null,
      requestId,
      error: text.slice(0, 300),
    };
  }

  const sse = await parseSse(res, startedAt);
  return {
    ok: !sse.error,
    status,
    totalMs: Date.now() - startedAt,
    firstTokenMs: sse.firstTokenMs,
    requestId,
    error: sse.error,
  };
};

const runPool = async (input: {
  totalRequests: number;
  concurrency: number;
  run: (index: number) => Promise<Result>;
}): Promise<Result[]> => {
  const results = new Array<Result>(input.totalRequests);
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= input.totalRequests) return;
      results[idx] = await input.run(idx);
    }
  };

  await Promise.all(
    Array.from({ length: input.concurrency }).map(() => worker())
  );
  return results;
};

async function main() {
  const baseUrl = (env.CHAT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const accessToken = required("CHAT_ACCESS_TOKEN");
  const agentId = required("CHAT_AGENT_ID");
  const concurrency = toInt(env.CHAT_CONCURRENCY, 50);
  const totalRequests = toInt(env.CHAT_TOTAL_REQUESTS, 200);
  const maxErrorRate = toFloat(env.CHAT_MAX_ERROR_RATE, 0.05);
  const sameSession = env.CHAT_SAME_SESSION === "1";

  const runId = `chat-load-${Date.now()}`;
  const startedAt = Date.now();
  const results = await runPool({
    totalRequests,
    concurrency,
    run: (idx) =>
      requestOnce({
        baseUrl,
        accessToken,
        agentId,
        sessionKey: sameSession ? `${runId}-shared` : `${runId}-${idx}`,
        message: `load-test message ${idx}`,
      }),
  });
  const elapsedMs = Date.now() - startedAt;

  const success = results.filter((item) => item.ok);
  const failure = results.filter((item) => !item.ok);
  const firstTokenSamples = success
    .map((item) => item.firstTokenMs)
    .filter((value): value is number => typeof value === "number");
  const totalSamples = success.map((item) => item.totalMs);

  const summary = {
    baseUrl,
    totalRequests,
    concurrency,
    elapsedMs,
    rps: Number(((totalRequests * 1000) / Math.max(1, elapsedMs)).toFixed(2)),
    success: success.length,
    failure: failure.length,
    errorRate: Number((failure.length / Math.max(1, totalRequests)).toFixed(4)),
    firstTokenP50: Number(percentile(firstTokenSamples, 0.5).toFixed(2)),
    firstTokenP95: Number(percentile(firstTokenSamples, 0.95).toFixed(2)),
    totalP50: Number(percentile(totalSamples, 0.5).toFixed(2)),
    totalP95: Number(percentile(totalSamples, 0.95).toFixed(2)),
  };

  console.log(JSON.stringify({ type: "chat_loadtest_summary", ...summary }, null, 2));
  if (failure.length > 0) {
    console.log(
      JSON.stringify(
        {
          type: "chat_loadtest_failures",
          samples: failure.slice(0, 10),
        },
        null,
        2
      )
    );
  }

  if (summary.errorRate > maxErrorRate) {
    console.error(
      `Chat load test failed: errorRate=${summary.errorRate} exceeds threshold=${maxErrorRate}`
    );
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Chat load test crashed: ${message}`);
  process.exit(1);
});
