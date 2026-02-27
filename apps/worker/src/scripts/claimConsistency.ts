import { createSupabaseClient } from "@daemon/adapters-supabase";

type JobRow = {
  id: string;
  type: string;
  status?: string;
  payload?: unknown;
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

const toBool = (value: string | undefined, fallback = false): boolean => {
  if (!value) return fallback;
  return value === "1" || value.toLowerCase() === "true";
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRunJob = (job: JobRow, runId: string, type: string): boolean => {
  if (job.type !== type) return false;
  if (!job.payload || typeof job.payload !== "object") return false;
  return (job.payload as Record<string, unknown>).runId === runId;
};

async function main() {
  const confirm = env.CLAIM_CONFIRM ?? "";
  if (confirm !== "I_UNDERSTAND_QUEUE_IMPACT") {
    throw new Error(
      "Set CLAIM_CONFIRM=I_UNDERSTAND_QUEUE_IMPACT before running this script."
    );
  }

  const supabaseUrl = required("SUPABASE_URL");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const workers = toInt(env.CLAIM_WORKERS, 5);
  const batchSize = toInt(env.CLAIM_BATCH_SIZE, 5);
  const testJobs = toInt(env.CLAIM_TEST_JOBS, 200);
  const timeoutMs = toInt(env.CLAIM_TIMEOUT_MS, 60000);
  const pollMs = toInt(env.CLAIM_POLL_MS, 30);
  const cleanup = toBool(env.CLAIM_CLEANUP, true);
  const jobType = env.CLAIM_JOB_TYPE ?? "__LOADTEST_CLAIM__";

  const client = createSupabaseClient({
    url: supabaseUrl,
    anonKey: serviceRoleKey,
  });

  const nowIso = new Date().toISOString();
  const { count: queuedCount, error: queuedError } = await client
    .from("jobs")
    .select("*", { count: "exact", head: true })
    .eq("status", "queued")
    .lte("run_at", nowIso);
  if (queuedError) throw queuedError;
  if ((queuedCount ?? 0) > 0 && !toBool(env.CLAIM_ALLOW_NONEMPTY_QUEUE, false)) {
    throw new Error(
      `Detected ${queuedCount} queued runnable jobs. Aborting to avoid claiming non-test jobs.`
    );
  }

  const runId = `claim-load-${Date.now()}`;
  const insertedIds: string[] = [];
  const rows = Array.from({ length: testJobs }).map((_, idx) => ({
    type: jobType,
    payload: { runId, index: idx },
    status: "queued",
    attempts: 0,
    run_at: nowIso,
  }));

  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { data, error } = await client.from("jobs").insert(chunk).select("id");
    if (error) throw error;
    for (const row of data ?? []) {
      insertedIds.push((row as { id: string }).id);
    }
  }

  const claimed = new Set<string>();
  const duplicates = new Set<string>();
  const unexpectedClaims: string[] = [];
  const startMs = Date.now();
  let stop = false;

  const processClaimedJobs = async (jobs: JobRow[]) => {
    const ownJobs = jobs.filter((job) => isRunJob(job, runId, jobType));
    const foreignJobs = jobs.filter((job) => !isRunJob(job, runId, jobType));

    for (const job of ownJobs) {
      if (claimed.has(job.id)) {
        duplicates.add(job.id);
      }
      claimed.add(job.id);
    }

    if (foreignJobs.length > 0) {
      unexpectedClaims.push(...foreignJobs.map((job) => job.id));
    }

    if (ownJobs.length > 0) {
      const ownIds = ownJobs.map((job) => job.id);
      const { error: completeError } = await client
        .from("jobs")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .in("id", ownIds);
      if (completeError) throw completeError;
    }
  };

  const worker = async () => {
    while (!stop) {
      const elapsed = Date.now() - startMs;
      if (elapsed > timeoutMs) {
        stop = true;
        return;
      }
      if (claimed.size >= testJobs) {
        stop = true;
        return;
      }

      const { data, error } = await client.rpc("claim_next_jobs", {
        batch_size: batchSize,
        now_at: new Date().toISOString(),
      });
      if (error) throw error;

      const jobs = Array.isArray(data) ? (data as JobRow[]) : [];
      if (jobs.length === 0) {
        await sleep(pollMs);
        continue;
      }
      await processClaimedJobs(jobs);
    }
  };

  await Promise.all(Array.from({ length: workers }).map(() => worker()));

  const durationMs = Date.now() - startMs;
  const missed = insertedIds.filter((id) => !claimed.has(id));

  const summary = {
    runId,
    workers,
    batchSize,
    inserted: insertedIds.length,
    claimed: claimed.size,
    duplicates: duplicates.size,
    missed: missed.length,
    unexpectedClaims: unexpectedClaims.length,
    durationMs,
  };
  console.log(JSON.stringify({ type: "claim_consistency_summary", ...summary }, null, 2));

  if (unexpectedClaims.length > 0) {
    console.log(
      JSON.stringify(
        {
          type: "claim_consistency_unexpected_claims",
          ids: unexpectedClaims.slice(0, 20),
        },
        null,
        2
      )
    );
  }

  if (cleanup && insertedIds.length > 0) {
    for (let i = 0; i < insertedIds.length; i += 200) {
      const chunk = insertedIds.slice(i, i + 200);
      const { error } = await client.from("jobs").delete().in("id", chunk);
      if (error) throw error;
    }
  }

  if (duplicates.size > 0 || missed.length > 0 || unexpectedClaims.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Claim consistency test failed: ${message}`);
  process.exit(1);
});
