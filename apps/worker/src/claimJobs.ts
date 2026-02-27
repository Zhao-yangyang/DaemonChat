export interface JobRecord {
  id: string;
  type: string;
  attempts?: number | null;
  [key: string]: unknown;
}

interface JobRpcClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: unknown | null }>;
}

export async function claimNextJobsAtomic(
  client: JobRpcClient,
  limit: number,
  now: () => string = () => new Date().toISOString()
): Promise<JobRecord[]> {
  const { data, error } = await client.rpc("claim_next_jobs", {
    batch_size: limit,
    now_at: now(),
  });

  if (error) {
    throw error;
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data as JobRecord[];
}
