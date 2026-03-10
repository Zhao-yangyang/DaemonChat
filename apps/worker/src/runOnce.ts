import type { JobRecord } from "./claimJobs";
import { claimNextJobsAtomic } from "./claimJobs";
import { resolveRetryState } from "./retry";

export interface RunOnceLogger {
  info: (event: string, fields?: Record<string, unknown>) => void;
  error: (event: string, fields?: Record<string, unknown>) => void;
}

export interface RunOnceDeps {
  client: {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: unknown | null }>;
    from: (table: string) => {
      update: (values: Record<string, unknown>) => {
        eq: (col: string, val: string) => PromiseLike<{ error: unknown | null }>;
        lt: (
          col: string,
          val: string,
        ) => PromiseLike<{ data: unknown; error: unknown | null; count: number | null }>;
      };
      insert: (row: Record<string, unknown>) => PromiseLike<{ error: unknown | null }>;
    };
  };
  memoryStore: any;
  transcriptStore: any;
  clock: { now: () => string };
  factories: {
    createLlmFromAgentConfig: (config: any) => any;
    createMemoryExtractionService: (deps: any) => {
      extractMemoryFromSession: (
        agentId: string,
        sessionId: string,
        scope: { scopeType: "user" | "team" | "org"; scopeId: string },
      ) => Promise<unknown[]>;
    };
    createCompactionService: (deps: any) => {
      compactIfNeeded: (
        agentId: string,
        sessionId: string,
        params: {
          shouldCompact: boolean;
          messages: Array<{ role: "user" | "assistant"; content: string }>;
        },
      ) => Promise<unknown>;
    };
  };
  logger: RunOnceLogger;
  serializeError: (error: unknown) => { message: string; name?: string };
}

export interface RunOnceOptions {
  claimBatchSize?: number;
  maxJobsPerRun?: number;
  maxDurationMs?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
}

export interface RunOnceSummary {
  requestId: string;
  claimed: number;
  completed: number;
  failed: number;
  dead: number;
  recovered: number;
  durationMs: number;
}

const SUPPORTED_JOB_TYPES = new Set(["COMPACTION", "MEMORY_FLUSH", "EMBEDDING_BACKFILL"]);
const SAFETY_MARGIN_MS = 5000;

export async function runOnce(
  deps: RunOnceDeps,
  opts: RunOnceOptions = {},
): Promise<RunOnceSummary> {
  const claimBatchSize = opts.claimBatchSize ?? 5;
  const maxJobsPerRun = opts.maxJobsPerRun ?? 20;
  const maxDurationMs = opts.maxDurationMs ?? 50_000;
  const maxAttempts = opts.maxAttempts ?? 5;
  const retryBaseDelayMs = opts.retryBaseDelayMs ?? 5000;
  const retryMaxDelayMs = opts.retryMaxDelayMs ?? 300_000;

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const deadline = startedAt + maxDurationMs;

  const summary: RunOnceSummary = {
    requestId,
    claimed: 0,
    completed: 0,
    failed: 0,
    dead: 0,
    recovered: 0,
    durationMs: 0,
  };

  const recovered = await recoverStaleJobs(deps, requestId);
  summary.recovered = recovered;

  let totalProcessed = 0;

  while (totalProcessed < maxJobsPerRun) {
    if (Date.now() + SAFETY_MARGIN_MS >= deadline) break;

    const jobs = await claimNextJobsAtomic(deps.client, claimBatchSize);
    if (jobs.length === 0) break;
    summary.claimed += jobs.length;

    for (const job of jobs) {
      if (Date.now() + SAFETY_MARGIN_MS >= deadline) break;
      const result = await processJob(deps, job, requestId, {
        maxAttempts,
        retryBaseDelayMs,
        retryMaxDelayMs,
      });
      if (result === "completed") summary.completed++;
      else if (result === "dead") summary.dead++;
      else summary.failed++;
      totalProcessed++;
      if (totalProcessed >= maxJobsPerRun) break;
    }
  }

  summary.durationMs = Date.now() - startedAt;

  deps.logger.info("worker.runOnce.completed", {
    request_id: requestId,
    route: "worker.runOnce",
    ...summary,
  });

  return summary;
}

async function recoverStaleJobs(deps: RunOnceDeps, requestId: string): Promise<number> {
  try {
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const result = await (deps.client as any)
      .from("jobs")
      .update({ status: "queued", updated_at: new Date().toISOString() })
      .eq("status", "processing")
      .lt("updated_at", staleThreshold)
      .select("id");

    const count = Array.isArray(result?.data) ? result.data.length : 0;
    if (count > 0) {
      deps.logger.info("worker.runOnce.recovered_stale", {
        request_id: requestId,
        route: "worker.runOnce",
        recovered_count: count,
      });
    }
    return count;
  } catch {
    return 0;
  }
}

type JobProcessResult = "completed" | "requeued" | "dead";

async function processJob(
  deps: RunOnceDeps,
  job: JobRecord,
  requestId: string,
  retryOpts: { maxAttempts: number; retryBaseDelayMs: number; retryMaxDelayMs: number },
): Promise<JobProcessResult> {
  const nowIso = new Date().toISOString();
  const startedAt = Date.now();

  try {
    if (!SUPPORTED_JOB_TYPES.has(job.type)) {
      throw new Error(`Unsupported job type: ${job.type}`);
    }

    const payloadValue = job.payload;
    const payload =
      payloadValue && typeof payloadValue === "object"
        ? (payloadValue as Record<string, unknown>)
        : {};

    const agentId = typeof payload.agentId === "string" ? payload.agentId : "";
    if (!agentId) {
      throw new Error(`Job ${job.type} missing agentId in payload`);
    }

    const { data: agentData, error: agentError } = await (deps.client as any)
      .from("agents")
      .select("config")
      .eq("id", agentId)
      .single();

    if (agentError || !agentData) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const agentConfig = agentData.config ?? {};
    const llmProvider = agentConfig.llmProvider;
    if (!llmProvider || !llmProvider.apiKey || !llmProvider.baseURL || !llmProvider.model) {
      throw new Error(`Agent ${agentId} 未配置 LLM Provider`);
    }

    const llm = deps.factories.createLlmFromAgentConfig(llmProvider);
    const clock = deps.clock;

    if (job.type === "COMPACTION") {
      const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
      if (!sessionId) {
        throw new Error("COMPACTION payload missing sessionId");
      }

      const maxMessages = typeof payload.maxMessages === "number" ? payload.maxMessages : 100;
      const { data: events, error: eventsError } = await (deps.client as any)
        .from("transcript_events")
        .select("type, content")
        .eq("agent_id", agentId)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(maxMessages);

      if (eventsError) {
        throw new Error(`Failed to fetch transcript events`);
      }

      const messages = (events ?? [])
        .filter((e: any) => e.type === "user_message" || e.type === "assistant_message")
        .map((e: any) => ({
          role: e.type === "user_message" ? "user" : "assistant",
          content: typeof e.content?.text === "string" ? e.content.text : "",
        }))
        .filter((m: { content: string }) => m.content.length > 0);

      const compaction = deps.factories.createCompactionService({
        transcripts: deps.transcriptStore,
        llm,
        clock,
      });

      await compaction.compactIfNeeded(agentId, sessionId, {
        shouldCompact: true,
        messages,
      });

      deps.logger.info("worker.job.compacted", {
        request_id: requestId,
        route: "worker.processJob",
        job_id: job.id,
        agent_id: agentId,
        session_id: sessionId,
      });
    } else if (job.type === "EMBEDDING_BACKFILL") {
      const { data: items, error: fetchError } = await (deps.client as any)
        .from("memory_items")
        .select("id, content")
        .eq("agent_id", agentId)
        .is("embedding", null)
        .limit(10);

      if (fetchError) {
        throw new Error(`Failed to fetch memory items`);
      }

      if (items && items.length > 0) {
        for (const item of items) {
          const vector = await llm.embed(String(item.content));
          await (deps.client as any)
            .from("memory_items")
            .update({ embedding: vector })
            .eq("id", item.id);
        }
      }

      deps.logger.info("worker.job.embedding_backfilled", {
        request_id: requestId,
        route: "worker.processJob",
        job_id: job.id,
        agent_id: agentId,
        count: items ? items.length : 0,
      });
    } else if (job.type === "MEMORY_FLUSH") {
      const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
      const scopeType =
        payload.scopeType === "user" || payload.scopeType === "team" || payload.scopeType === "org"
          ? payload.scopeType
          : "user";
      const scopeId = typeof payload.scopeId === "string" ? payload.scopeId : "";

      if (!sessionId || !scopeId) {
        throw new Error("MEMORY_FLUSH payload missing sessionId/scopeId");
      }

      const memoryExtraction = deps.factories.createMemoryExtractionService({
        memories: deps.memoryStore,
        llm,
        clock,
      });

      const extracted = await memoryExtraction.extractMemoryFromSession(agentId, sessionId, {
        scopeType,
        scopeId,
      });
      deps.logger.info("worker.job.memory_flushed", {
        request_id: requestId,
        route: "worker.processJob",
        job_id: job.id,
        job_type: job.type,
        agent_id: agentId,
        session_id: sessionId,
        extracted_count: extracted.length,
      });
    }

    await deps.client
      .from("jobs")
      .update({ status: "completed", updated_at: nowIso })
      .eq("id", job.id);

    deps.logger.info("worker.job.completed", {
      request_id: requestId,
      route: "worker.processJob",
      job_id: job.id,
      job_type: job.type,
      attempts: job.attempts ?? 0,
      latency_ms: Date.now() - startedAt,
    });
    return "completed";
  } catch (err) {
    const retryState = resolveRetryState({
      currentAttempts: job.attempts ?? 0,
      maxAttempts: retryOpts.maxAttempts,
      baseDelayMs: retryOpts.retryBaseDelayMs,
      maxDelayMs: retryOpts.retryMaxDelayMs,
    });
    const nextStatus = retryState.shouldDeadLetter ? "dead" : "queued";
    const nextRunAt = retryState.shouldDeadLetter ? nowIso : retryState.runAtIso;
    const details = deps.serializeError(err);

    await deps.client
      .from("jobs")
      .update({
        status: nextStatus,
        attempts: retryState.attempts,
        run_at: nextRunAt,
        updated_at: nowIso,
      })
      .eq("id", job.id);

    const payloadValue = job.payload;
    const payload =
      payloadValue && typeof payloadValue === "object"
        ? (payloadValue as Record<string, unknown>)
        : undefined;
    const agentId = typeof payload?.agentId === "string" ? payload.agentId : null;

    try {
      await deps.client.from("audit_events").insert({
        tenant_id: null,
        agent_id: agentId,
        event_type: "job_failed",
        payload: {
          jobId: job.id,
          jobType: job.type,
          attempts: retryState.attempts,
          nextStatus,
          nextRunAt,
          retryDelayMs: retryState.retryDelayMs,
          errorMessage: details.message,
          errorName: details.name ?? null,
          requestId,
        },
        created_at: nowIso,
      });
    } catch {
      deps.logger.error("worker.job.audit_insert_failed", {
        request_id: requestId,
        route: "worker.processJob",
        job_id: job.id,
        job_type: job.type,
        error_code: "AUDIT_WRITE_FAILED",
      });
    }

    deps.logger.error("worker.job.failed", {
      request_id: requestId,
      route: "worker.processJob",
      job_id: job.id,
      job_type: job.type,
      attempts: retryState.attempts,
      next_status: nextStatus,
      next_run_at: nextRunAt,
      retry_delay_ms: retryState.retryDelayMs,
      error_code: "JOB_FAILED",
      error_name: details.name ?? null,
      error_message: details.message,
      latency_ms: Date.now() - startedAt,
    });

    return retryState.shouldDeadLetter ? "dead" : "requeued";
  }
}
