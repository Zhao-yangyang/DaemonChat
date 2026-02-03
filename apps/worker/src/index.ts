import { createWorkerContainer } from "./container";

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
};

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const { client } = createWorkerContainer(env);

const POLL_INTERVAL_MS = Number(process.env.JOB_POLL_INTERVAL_MS ?? 5000);

async function claimNextJobs(limit: number) {
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("jobs")
    .select("*")
    .eq("status", "queued")
    .lte("run_at", now)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

async function processJob(job: any) {
  const { error: claimError } = await client
    .from("jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", "queued");

  if (claimError) throw claimError;

  try {
    // TODO: route by job.type (COMPACTION/MEMORY_FLUSH/EMBEDDING_BACKFILL)
    console.log("Processing job", job.id, job.type);

    const { error: completeError } = await client
      .from("jobs")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", job.id);

    if (completeError) throw completeError;
  } catch (err) {
    console.error("Job failed", job.id, err);
    await client
      .from("jobs")
      .update({
        status: "failed",
        attempts: (job.attempts ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  }
}

async function poll() {
  const jobs = await claimNextJobs(5);
  for (const job of jobs) {
    await processJob(job);
  }
}

setInterval(() => {
  poll().catch((err) => console.error("Worker poll error", err));
}, POLL_INTERVAL_MS);

console.log("Worker started, polling every", POLL_INTERVAL_MS, "ms");
