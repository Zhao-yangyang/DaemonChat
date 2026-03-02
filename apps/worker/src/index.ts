import { createWorkerContainer } from "./container";
import { runOnce } from "./runOnce";
import { logError, logInfo, serializeError } from "./logger";

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  OPENAI_EMBED_MODEL: process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  LLM_PROVIDER_NAME: process.env.LLM_PROVIDER_NAME as "openai" | "deepseek" | undefined,
  LLM_COMPATIBILITY: process.env.LLM_COMPATIBILITY as "strict" | "compatible" | undefined,
  EMBEDDING_MODE: process.env.EMBEDDING_MODE as "remote" | "local" | undefined,
  ALLOW_LOCAL_EMBEDDING_FALLBACK: process.env.ALLOW_LOCAL_EMBEDDING_FALLBACK,
  LOCAL_EMBED_DIMENSIONS: process.env.LOCAL_EMBED_DIMENSIONS,
};

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const { client, memoryExtraction } = createWorkerContainer(env);

const POLL_INTERVAL_MS = Number(process.env.JOB_POLL_INTERVAL_MS ?? 5000);
const MAX_JOB_ATTEMPTS = Number(process.env.JOB_MAX_ATTEMPTS ?? 5);
const RETRY_BASE_DELAY_MS = Number(process.env.JOB_RETRY_BASE_MS ?? 5000);
const RETRY_MAX_DELAY_MS = Number(process.env.JOB_RETRY_MAX_MS ?? 300000);

const deps = {
  client: client as any,
  memoryExtraction,
  logger: { info: logInfo, error: logError },
  serializeError,
};

const options = {
  maxAttempts: MAX_JOB_ATTEMPTS,
  retryBaseDelayMs: RETRY_BASE_DELAY_MS,
  retryMaxDelayMs: RETRY_MAX_DELAY_MS,
  maxDurationMs: POLL_INTERVAL_MS > 10_000 ? POLL_INTERVAL_MS - 2000 : undefined,
};

setInterval(() => {
  runOnce(deps, options).catch((err) => {
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
