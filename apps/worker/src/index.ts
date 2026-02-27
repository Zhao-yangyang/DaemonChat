import { createWorkerContainer } from "./container";
import { claimNextJobsAtomic } from "./claimJobs";
import { logError, logInfo, serializeError } from "./logger";
import { resolveRetryState } from "./retry";

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
};

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const { client } = createWorkerContainer(env);

const POLL_INTERVAL_MS = Number(process.env.JOB_POLL_INTERVAL_MS ?? 5000);
const MAX_JOB_ATTEMPTS = Number(process.env.JOB_MAX_ATTEMPTS ?? 5);
const RETRY_BASE_DELAY_MS = Number(process.env.JOB_RETRY_BASE_MS ?? 5000);
const RETRY_MAX_DELAY_MS = Number(process.env.JOB_RETRY_MAX_MS ?? 300000);
const SUPPORTED_JOB_TYPES = new Set(["COMPACTION", "MEMORY_FLUSH", "EMBEDDING_BACKFILL"]);

async function processJob(
  job: { id: string; type: string; attempts?: number | null; payload?: unknown },
  requestId: string
) {
  const nowIso = new Date().toISOString();
  const startedAt = Date.now();

  try {
    if (!SUPPORTED_JOB_TYPES.has(job.type)) {
      throw new Error(`Unsupported job type: ${job.type}`);
    }

    // TODO: route by job.type handlers once domain worker usecases are implemented.
    logInfo("worker.job.processing", {
      request_id: requestId,
      route: "worker.processJob",
      job_id: job.id,
      job_type: job.type,
      attempts: job.attempts ?? 0,
    });

    const { error: completeError } = await client
      .from("jobs")
      .update({ status: "completed", updated_at: nowIso })
      .eq("id", job.id);

    if (completeError) throw completeError;
    logInfo("worker.job.completed", {
      request_id: requestId,
      route: "worker.processJob",
      job_id: job.id,
      job_type: job.type,
      attempts: job.attempts ?? 0,
      latency_ms: Date.now() - startedAt,
    });
  } catch (err) {
    const retryState = resolveRetryState({
      currentAttempts: job.attempts ?? 0,
      maxAttempts: MAX_JOB_ATTEMPTS,
      baseDelayMs: RETRY_BASE_DELAY_MS,
      maxDelayMs: RETRY_MAX_DELAY_MS,
    });
    const nextStatus = retryState.shouldDeadLetter ? "dead" : "queued";
    const nextRunAt = retryState.shouldDeadLetter ? nowIso : retryState.runAtIso;
    const details = serializeError(err);

    await client
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

    const { error: auditError } = await client.from("audit_events").insert({
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

    if (auditError) {
      logError("worker.job.audit_insert_failed", {
        request_id: requestId,
        route: "worker.processJob",
        job_id: job.id,
        job_type: job.type,
        error_code: "AUDIT_WRITE_FAILED",
        error_message: String((auditError as { message?: unknown }).message ?? auditError),
      });
    }

    logError("worker.job.failed", {
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
  }
}

async function poll() {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const jobs = await claimNextJobsAtomic(client, 5);
  logInfo("worker.poll.claimed", {
    request_id: requestId,
    route: "worker.poll",
    jobs_claimed: jobs.length,
  });
  for (const job of jobs) {
    await processJob(job, requestId);
  }
  logInfo("worker.poll.completed", {
    request_id: requestId,
    route: "worker.poll",
    jobs_claimed: jobs.length,
    latency_ms: Date.now() - startedAt,
  });
}

setInterval(() => {
  poll().catch((err) => {
    const details = serializeError(err);
    logError("worker.poll.error", {
      request_id: crypto.randomUUID(),
      route: "worker.poll",
      error_code: "POLL_FAILED",
      error_name: details.name ?? null,
      error_message: details.message,
    });
  });
}, POLL_INTERVAL_MS);

logInfo("worker.started", {
  request_id: crypto.randomUUID(),
  route: "worker.bootstrap",
  poll_interval_ms: POLL_INTERVAL_MS,
  max_job_attempts: MAX_JOB_ATTEMPTS,
  retry_base_delay_ms: RETRY_BASE_DELAY_MS,
  retry_max_delay_ms: RETRY_MAX_DELAY_MS,
});
