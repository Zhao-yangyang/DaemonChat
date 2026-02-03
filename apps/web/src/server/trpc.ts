import { createContext as baseCreateContext } from "@daemon/api";
import type { ApiContext, ApiUser } from "@daemon/api";
import { createContainer } from "./container";

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  OPENAI_EMBED_MODEL: process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small",
};

export async function createContext(opts: { req: Request }): Promise<ApiContext> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  const userId = opts.req.headers.get("x-user-id");
  const accessToken = opts.req.headers.get("x-access-token");
  const user: ApiUser | null = userId ? { id: userId } : null;

  const container = createContainer(env, accessToken ?? undefined);

  return baseCreateContext({ user, container });
}
