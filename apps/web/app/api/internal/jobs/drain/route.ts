import {
  createSupabaseClient,
  createMemoryStore,
  createTranscriptStore,
} from "@daemon/adapters-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLlmFromAgentConfig } from "@daemon/adapters-llm-vercel";
import {
  createMemoryExtractionService,
  DEFAULT_AGENT_CONFIG,
  createCompactionService,
} from "@daemon/domain";
import type { MemoryStore, TranscriptStore } from "@daemon/domain";
import { logInfo, logWarn, logError } from "@/src/server/logger";

const env = {
  CRON_SECRET: process.env.CRON_SECRET ?? "",
  SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
};

interface JobRow {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  attempts: number;
  [key: string]: unknown;
}

const CLAIM_BATCH_SIZE = 5;
const MAX_JOBS_PER_RUN = 20;
const MAX_DURATION_MS = 50_000;
const SAFETY_MARGIN_MS = 5000;
const SUPPORTED_JOB_TYPES = new Set(["COMPACTION", "MEMORY_FLUSH", "EMBEDDING_BACKFILL"]);
const MAX_JOB_ATTEMPTS = 5;
const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 300_000;
const STALE_THRESHOLD_MS = 5 * 60 * 1000;
const QUEUE_DEPTH_ALERT_THRESHOLD = Number(process.env.QUEUE_DEPTH_ALERT_THRESHOLD ?? 50);

function calculateRetryDelayMs(attempt: number, baseMs: number, maxMs: number): number {
  const a = Math.max(1, Math.floor(attempt));
  const b = Math.max(1, Math.floor(baseMs));
  const m = Math.max(b, Math.floor(maxMs));
  const delay = b * 2 ** (a - 1);
  if (!Number.isFinite(delay)) return m;
  return Math.min(m, Math.max(1, Math.floor(delay)));
}

function resolveRetry(currentAttempts: number) {
  const attempts = Math.max(0, Math.floor(currentAttempts)) + 1;
  const shouldDeadLetter = attempts >= MAX_JOB_ATTEMPTS;
  const retryDelayMs = shouldDeadLetter
    ? 0
    : calculateRetryDelayMs(attempts, RETRY_BASE_MS, RETRY_MAX_MS);
  return {
    attempts,
    shouldDeadLetter,
    retryDelayMs,
    runAtIso: new Date(Date.now() + retryDelayMs).toISOString(),
  };
}

function serializeError(error: unknown): { message: string; name?: string } {
  if (error instanceof Error) return { message: error.message, name: error.name };
  return { message: String(error) };
}

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  const authHeader = req.headers.get("authorization") ?? "";
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    logError("cron.drain.config_missing", { request_id: requestId, route: "cron.drain" });
    return Response.json({ error: "Missing service config" }, { status: 500 });
  }

  const client = createSupabaseClient({
    url: env.SUPABASE_URL,
    anonKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const memoryStore = createMemoryStore(client);
  const transcriptStore = createTranscriptStore(client);

  const summary = {
    requestId,
    claimed: 0,
    completed: 0,
    failed: 0,
    dead: 0,
    recovered: 0,
    queueDepth: 0,
    oldestQueuedAgeSec: 0,
    durationMs: 0,
  };
  const deadline = startedAt + MAX_DURATION_MS;

  try {
    const depthResult = await client
      .from("jobs")
      .select("created_at", { count: "exact", head: false })
      .eq("status", "queued")
      .lte("run_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(1);

    summary.queueDepth = depthResult?.count ?? 0;
    if (Array.isArray(depthResult?.data) && depthResult.data.length > 0) {
      const oldest = new Date(depthResult.data[0].created_at);
      summary.oldestQueuedAgeSec = Math.round((Date.now() - oldest.getTime()) / 1000);
    }

    if (summary.queueDepth >= QUEUE_DEPTH_ALERT_THRESHOLD) {
      logWarn("cron.drain.queue_depth_high", {
        request_id: requestId,
        route: "cron.drain",
        queue_depth: summary.queueDepth,
        oldest_queued_age_sec: summary.oldestQueuedAgeSec,
        threshold: QUEUE_DEPTH_ALERT_THRESHOLD,
      });
    }
  } catch {
    // best-effort metrics
  }

  try {
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
    const staleResult = await client
      .from("jobs")
      .update({ status: "queued", updated_at: new Date().toISOString() })
      .eq("status", "processing")
      .lt("updated_at", staleThreshold)
      .select("id");
    summary.recovered = Array.isArray(staleResult?.data) ? staleResult.data.length : 0;
    if (summary.recovered > 0) {
      logInfo("cron.drain.recovered_stale", {
        request_id: requestId,
        route: "cron.drain",
        recovered_count: summary.recovered,
      });
    }
  } catch {
    // best-effort recovery
  }

  let totalProcessed = 0;

  while (totalProcessed < MAX_JOBS_PER_RUN) {
    if (Date.now() + SAFETY_MARGIN_MS >= deadline) break;

    const { data, error: claimError } = await client.rpc("claim_next_jobs", {
      batch_size: CLAIM_BATCH_SIZE,
      now_at: new Date().toISOString(),
    });

    if (claimError) {
      logError("cron.drain.claim_error", {
        request_id: requestId,
        route: "cron.drain",
        error_message: String(claimError.message ?? claimError),
      });
      break;
    }

    const jobs = Array.isArray(data) ? (data as JobRow[]) : [];
    if (jobs.length === 0) break;
    summary.claimed += jobs.length;

    for (const job of jobs) {
      if (Date.now() + SAFETY_MARGIN_MS >= deadline) break;

      const result = await processJob({
        client,
        memoryStore,
        transcriptStore,
        job,
        requestId,
      });
      if (result === "completed") summary.completed++;
      else if (result === "dead") summary.dead++;
      else summary.failed++;

      totalProcessed++;
      if (totalProcessed >= MAX_JOBS_PER_RUN) break;
    }
  }

  summary.durationMs = Date.now() - startedAt;

  const failureRate = summary.claimed > 0 ? (summary.failed + summary.dead) / summary.claimed : 0;
  if (failureRate > 0.5 && summary.claimed > 0) {
    logWarn("cron.drain.high_failure_rate", {
      request_id: requestId,
      route: "cron.drain",
      failure_rate: Math.round(failureRate * 100),
      ...summary,
    });
  }

  logInfo("cron.drain.completed", {
    request_id: requestId,
    route: "cron.drain",
    ...summary,
    failure_rate_pct: summary.claimed > 0 ? Math.round(failureRate * 100) : 0,
  });

  return Response.json(summary, {
    headers: { "X-Request-Id": requestId },
  });
}

type ProcessResult = "completed" | "requeued" | "dead";

async function processJob(args: {
  client: SupabaseClient;
  memoryStore: MemoryStore;
  transcriptStore: TranscriptStore;
  job: JobRow;
  requestId: string;
}): Promise<ProcessResult> {
  const { client, memoryStore, transcriptStore, job, requestId } = args;
  const nowIso = new Date().toISOString();
  const jobStarted = Date.now();

  try {
    if (!SUPPORTED_JOB_TYPES.has(job.type)) {
      throw new Error(`Unsupported job type: ${job.type}`);
    }

    const payload: Record<string, unknown> = job.payload ?? {};

    const agentId = typeof payload.agentId === "string" ? payload.agentId : "";
    if (!agentId) {
      throw new Error(`Job ${job.type} missing agentId in payload`);
    }

    const { data: agentData, error: agentError } = await client
      .from("agents")
      .select("config")
      .eq("id", agentId)
      .single();

    if (agentError || !agentData) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const agentConfig = { ...DEFAULT_AGENT_CONFIG, ...(agentData.config ?? {}) };
    const llmProvider = agentConfig.llmProvider;
    if (!llmProvider || !llmProvider.apiKey || !llmProvider.baseURL || !llmProvider.model) {
      throw new Error(`Agent ${agentId} 未配置 LLM Provider`);
    }

    const llm = createLlmFromAgentConfig(llmProvider);
    const clock = { now: () => new Date().toISOString() };

    if (job.type === "MEMORY_FLUSH") {
      const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
      const scopeType =
        payload.scopeType === "user" || payload.scopeType === "team" || payload.scopeType === "org"
          ? payload.scopeType
          : "user";
      const scopeId = typeof payload.scopeId === "string" ? payload.scopeId : "";

      if (!sessionId || !scopeId) {
        throw new Error("MEMORY_FLUSH payload missing sessionId/scopeId");
      }

      const memoryExtraction = createMemoryExtractionService({
        transcripts: transcriptStore,
        memory: memoryStore,
        llm,
        clock,
      });

      const extracted = await memoryExtraction.extractMemoryFromSession(agentId, sessionId, {
        scopeType,
        scopeId,
      });
      logInfo("cron.job.memory_flushed", {
        request_id: requestId,
        route: "cron.drain",
        job_id: job.id,
        job_type: job.type,
        agent_id: agentId,
        extracted_count: Array.isArray(extracted) ? extracted.length : 0,
      });
    } else if (job.type === "COMPACTION") {
      const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
      if (!sessionId) {
        throw new Error("COMPACTION payload missing sessionId");
      }

      const compaction = createCompactionService({
        transcripts: transcriptStore,
        llm,
        clock,
      });

      // For drain route compaction we'll pass shouldCompact: true to force it
      // since the job was already scheduled
      const event = await compaction.compactIfNeeded(agentId, sessionId, {
        shouldCompact: true,
        messages: [], // Actually it fetches anyway inside
      });
      const processedCount = event ? 1 : 0;
      logInfo("cron.job.compacted", {
        request_id: requestId,
        route: "cron.drain",
        job_id: job.id,
        job_type: job.type,
        agent_id: agentId,
        processed_count: processedCount,
      });
    } else if (job.type === "EMBEDDING_BACKFILL") {
      // Stub implementation for now until actual backfill service is created
      logInfo("cron.job.embedding_backfill.stubbed", {
        request_id: requestId,
        route: "cron.drain",
        job_id: job.id,
      });
    }

    await client.from("jobs").update({ status: "completed", updated_at: nowIso }).eq("id", job.id);

    logInfo("cron.job.completed", {
      request_id: requestId,
      route: "cron.drain",
      job_id: job.id,
      job_type: job.type,
      latency_ms: Date.now() - jobStarted,
    });
    return "completed";
  } catch (err) {
    const retry = resolveRetry(job.attempts ?? 0);
    const nextStatus = retry.shouldDeadLetter ? "dead" : "queued";
    const nextRunAt = retry.shouldDeadLetter ? nowIso : retry.runAtIso;
    const details = serializeError(err);

    await client
      .from("jobs")
      .update({
        status: nextStatus,
        attempts: retry.attempts,
        run_at: nextRunAt,
        updated_at: nowIso,
      })
      .eq("id", job.id);

    const agentId = typeof job.payload?.agentId === "string" ? job.payload.agentId : null;

    try {
      await client.from("audit_events").insert({
        tenant_id: null,
        agent_id: agentId,
        event_type: "job_failed",
        payload: {
          jobId: job.id,
          jobType: job.type,
          attempts: retry.attempts,
          nextStatus,
          nextRunAt,
          retryDelayMs: retry.retryDelayMs,
          errorMessage: details.message,
          errorName: details.name ?? null,
          requestId,
        },
        created_at: nowIso,
      });
    } catch {
      logError("cron.job.audit_insert_failed", {
        request_id: requestId,
        route: "cron.drain",
        job_id: job.id,
      });
    }

    logError("cron.job.failed", {
      request_id: requestId,
      route: "cron.drain",
      job_id: job.id,
      job_type: job.type,
      attempts: retry.attempts,
      next_status: nextStatus,
      error_message: details.message,
      latency_ms: Date.now() - jobStarted,
    });

    return retry.shouldDeadLetter ? "dead" : "requeued";
  }
}
