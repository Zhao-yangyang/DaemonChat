import { describe, expect, test } from "bun:test";
import { claimNextJobsAtomic } from "./claimJobs";

describe("claimNextJobsAtomic", () => {
  test("claims jobs via atomic RPC call", async () => {
    let calledWith: { fn: string; args: Record<string, unknown> } | null = null;
    const fakeJobs = [{ id: "job-1", type: "COMPACTION", attempts: 0 }];

    const jobs = await claimNextJobsAtomic(
      {
        rpc: async (fn: string, args: Record<string, unknown>) => {
          calledWith = { fn, args };
          return { data: fakeJobs, error: null };
        },
      },
      5,
      () => "2026-02-26T00:00:00.000Z",
    );

    expect(calledWith).not.toBeNull();
    expect(calledWith!).toEqual({
      fn: "claim_next_jobs",
      args: {
        batch_size: 5,
        now_at: "2026-02-26T00:00:00.000Z",
      },
    });
    expect(jobs).toEqual(fakeJobs);
  });

  test("throws when RPC returns an error", async () => {
    await expect(
      claimNextJobsAtomic(
        {
          rpc: async () => ({
            data: null,
            error: { message: "db error" },
          }),
        },
        2,
      ),
    ).rejects.toEqual({ message: "db error" });
  });
});
