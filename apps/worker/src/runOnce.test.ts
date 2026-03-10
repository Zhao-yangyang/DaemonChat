import { describe, test, expect } from "bun:test";
import { runOnce, type RunOnceDeps, type RunOnceOptions, type SupabaseRpcClient } from "./runOnce";
import type { MemoryStore, TranscriptStore, LlmPort } from "@daemon/domain";

/* ------------------------------------------------------------------ */
/*  helpers                                                           */
/* ------------------------------------------------------------------ */

const noopLogger = { info: () => {}, error: () => {} };
const serializeError = (err: unknown) => ({
  message: err instanceof Error ? err.message : String(err),
  name: err instanceof Error ? err.name : undefined,
});

type MockJob = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts?: number;
  run_at?: string;
};

function createMockDeps(overrides: {
  jobs?: MockJob[];
  compactResult?: unknown;
  embeddingResult?: number[];
  transcriptEvents?: Array<{ type: string; content: { text?: string } }>;
  memoryItems?: Array<{ id: string; content: string }>;
}): RunOnceDeps {
  const {
    jobs = [],
    compactResult = null,
    embeddingResult = [0.1, 0.2, 0.3],
    transcriptEvents = [],
    memoryItems = [],
  } = overrides;

  let jobIndex = 0;
  const updatedJobs: Array<{ id: string; status: string }> = [];

  const client = {
    rpc: async (_fn: string, _args: Record<string, unknown>) => {
      const batch = jobs.slice(jobIndex, jobIndex + 5);
      jobIndex += batch.length;
      return { data: batch, error: null };
    },
    from: (table: string) => {
      if (table === "jobs") {
        return {
          update: (values: Record<string, unknown>) => ({
            eq: (_col: string, val: string) => {
              updatedJobs.push({ id: val, status: values.status as string });
              return Promise.resolve({ error: null });
            },
            lt: () => Promise.resolve({ data: [], error: null, count: 0 }),
          }),
          insert: () => Promise.resolve({ error: null }),
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => Promise.resolve({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "transcript_events") {
        return {
          update: (_values: Record<string, unknown>) => ({
            eq: (_c: string, _v: string) => Promise.resolve({ error: null }),
            lt: () => Promise.resolve({ data: [], error: null, count: 0 }),
          }),
          insert: () => Promise.resolve({ error: null }),
          select: (_cols: string) => ({
            eq: (_c1: string, _v1: string) => ({
              eq: (_c2: string, _v2: string) => ({
                order: (_c3: string, _opts: Record<string, unknown>) => ({
                  limit: (_n: number) => Promise.resolve({ data: transcriptEvents, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "memory_items") {
        return {
          update: (_values: Record<string, unknown>) => ({
            eq: (_c: string, _v: string) => Promise.resolve({ error: null }),
            lt: () => Promise.resolve({ data: [], error: null, count: 0 }),
          }),
          insert: () => Promise.resolve({ error: null }),
          select: (_cols: string) => ({
            eq: (_c1: string, _v1: string) => ({
              is: (_c2: string, _v2: null) => ({
                limit: (_n: number) => Promise.resolve({ data: memoryItems, error: null }),
              }),
              eq: (_c2: string, _v2: string) => ({
                order: () => ({
                  limit: () => Promise.resolve({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "agents") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    config: {
                      llmProvider: {
                        apiKey: "test-key",
                        baseURL: "http://test",
                        model: "test-model",
                      },
                    },
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "audit_events") {
        return {
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
            lt: () => Promise.resolve({ data: [], error: null, count: 0 }),
          }),
          insert: () => Promise.resolve({ error: null }),
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => Promise.resolve({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      // fallback
      return {
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
          lt: () => Promise.resolve({ data: [], error: null, count: 0 }),
        }),
        insert: () => Promise.resolve({ error: null }),
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        }),
      };
    },
  } as unknown as SupabaseRpcClient;

  return {
    client,
    memoryStore: {} as unknown as MemoryStore,
    transcriptStore: {} as unknown as TranscriptStore,
    clock: { now: () => new Date().toISOString() },
    factories: {
      createLlmFromAgentConfig: () =>
        ({
          embed: async () => embeddingResult,
          streamChat: async function* () {},
          completeChat: async () => "",
        }) as unknown as LlmPort,
      createMemoryExtractionService: () => ({
        extractMemoryFromSession: async () => [],
      }),
      createCompactionService: () => ({
        compactIfNeeded: async () => compactResult,
      }),
    },
    logger: noopLogger,
    serializeError,
  };
}

const defaultOpts: RunOnceOptions = {
  maxAttempts: 3,
  retryBaseDelayMs: 100,
  retryMaxDelayMs: 1000,
  maxDurationMs: 30000,
};

/* ------------------------------------------------------------------ */
/*  tests                                                             */
/* ------------------------------------------------------------------ */

describe("runOnce COMPACTION job", () => {
  test("processes COMPACTION job successfully", async () => {
    const deps = createMockDeps({
      jobs: [
        {
          id: "job-1",
          type: "COMPACTION",
          payload: { agentId: "agent-1", sessionId: "session-1" },
        },
      ],
      transcriptEvents: [
        { type: "user_message", content: { text: "hello" } },
        { type: "assistant_message", content: { text: "hi there" } },
      ],
    });

    const summary = await runOnce(deps, defaultOpts);

    expect(summary.claimed).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.dead).toBe(0);
  });

  test("fails COMPACTION job when payload is missing agentId", async () => {
    const deps = createMockDeps({
      jobs: [
        {
          id: "job-2",
          type: "COMPACTION",
          payload: { sessionId: "session-1" },
        },
      ],
    });

    const summary = await runOnce(deps, defaultOpts);

    expect(summary.claimed).toBe(1);
    expect(summary.completed).toBe(0);
    // Should either fail or be dead-lettered
    expect(summary.failed + summary.dead).toBe(1);
  });

  test("fails COMPACTION job when payload is missing sessionId", async () => {
    const deps = createMockDeps({
      jobs: [
        {
          id: "job-3",
          type: "COMPACTION",
          payload: { agentId: "agent-1" },
        },
      ],
    });

    const summary = await runOnce(deps, defaultOpts);

    expect(summary.claimed).toBe(1);
    expect(summary.completed).toBe(0);
    expect(summary.failed + summary.dead).toBe(1);
  });
});

describe("runOnce EMBEDDING_BACKFILL job", () => {
  test("processes EMBEDDING_BACKFILL job and backfills items", async () => {
    const deps = createMockDeps({
      jobs: [
        {
          id: "job-4",
          type: "EMBEDDING_BACKFILL",
          payload: { agentId: "agent-1" },
        },
      ],
      memoryItems: [
        { id: "mem-1", content: "remember this" },
        { id: "mem-2", content: "and this" },
      ],
      embeddingResult: [0.1, 0.2, 0.3],
    });

    const summary = await runOnce(deps, defaultOpts);

    expect(summary.claimed).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(0);
  });

  test("fails EMBEDDING_BACKFILL job when payload is missing agentId", async () => {
    const deps = createMockDeps({
      jobs: [
        {
          id: "job-5",
          type: "EMBEDDING_BACKFILL",
          payload: {},
        },
      ],
    });

    const summary = await runOnce(deps, defaultOpts);

    expect(summary.claimed).toBe(1);
    expect(summary.completed).toBe(0);
    expect(summary.failed + summary.dead).toBe(1);
  });

  test("handles empty memory items gracefully", async () => {
    const deps = createMockDeps({
      jobs: [
        {
          id: "job-6",
          type: "EMBEDDING_BACKFILL",
          payload: { agentId: "agent-1" },
        },
      ],
      memoryItems: [],
    });

    const summary = await runOnce(deps, defaultOpts);

    expect(summary.claimed).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(0);
  });
});

describe("runOnce MEMORY_FLUSH job", () => {
  test("processes MEMORY_FLUSH job successfully", async () => {
    const deps = createMockDeps({
      jobs: [
        {
          id: "job-7",
          type: "MEMORY_FLUSH",
          payload: {
            agentId: "agent-1",
            sessionId: "session-1",
            scopeType: "user",
            scopeId: "user-1",
          },
        },
      ],
    });

    const summary = await runOnce(deps, defaultOpts);

    expect(summary.claimed).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(0);
  });
});

describe("runOnce no jobs", () => {
  test("returns zero counters when queue is empty", async () => {
    const deps = createMockDeps({ jobs: [] });
    const summary = await runOnce(deps, defaultOpts);

    expect(summary.claimed).toBe(0);
    expect(summary.completed).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.dead).toBe(0);
  });
});
