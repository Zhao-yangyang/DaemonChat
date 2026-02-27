import { createContext as baseCreateContext } from "@daemon/api";
import type { ApiContext } from "@daemon/api";
import { createContainer } from "./container";
import { resolveApiUserFromAccessToken } from "./auth";
import { logError, logInfo, logWarn, serializeError } from "./logger";

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY:
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  OPENAI_FALLBACK_MODEL: process.env.OPENAI_FALLBACK_MODEL,
  OPENAI_EMBED_MODEL: process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  LLM_PROVIDER_NAME: process.env.LLM_PROVIDER_NAME as "openai" | "deepseek" | undefined,
  LLM_COMPATIBILITY: process.env.LLM_COMPATIBILITY as "strict" | "compatible" | undefined,
  EMBEDDING_MODE: process.env.EMBEDDING_MODE as "remote" | "local" | undefined,
  ALLOW_LOCAL_EMBEDDING_FALLBACK: process.env.ALLOW_LOCAL_EMBEDDING_FALLBACK,
  LOCAL_EMBED_DIMENSIONS: process.env.LOCAL_EMBED_DIMENSIONS,
};

export async function createContext(opts: { req: Request }): Promise<ApiContext> {
  const startedAt = Date.now();
  const requestId = opts.req.headers.get("x-request-id") ?? crypto.randomUUID();
  const route = "/api/trpc";

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    logError("trpc.context.server_config_error", {
      request_id: requestId,
      route,
      error_code: "SERVER_CONFIG",
      latency_ms: Date.now() - startedAt,
    });
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  const accessToken = opts.req.headers.get("x-access-token");
  let user = null;
  try {
    user = await resolveApiUserFromAccessToken({
      supabaseUrl: env.SUPABASE_URL,
      supabaseAnonKey: env.SUPABASE_ANON_KEY,
      accessToken,
    });
  } catch (error) {
    const details = serializeError(error);
    logWarn("trpc.context.auth_lookup_failed", {
      request_id: requestId,
      route,
      error_code: "AUTH_LOOKUP_FAILED",
      error_name: details.name ?? null,
      error_message: details.message,
      method: opts.req.method,
      path: new URL(opts.req.url).pathname,
      latency_ms: Date.now() - startedAt,
    });
  }

  const container = createContainer(env, accessToken ?? undefined);

  if (!user) {
    logWarn("trpc.context.unauthorized", {
      request_id: requestId,
      route,
      error_code: "UNAUTHORIZED",
      method: opts.req.method,
      path: new URL(opts.req.url).pathname,
      latency_ms: Date.now() - startedAt,
    });
  }

  const logger = {
    info: (event: string, fields: Record<string, unknown> = {}) =>
      logInfo(event, { request_id: requestId, route, ...fields }),
    warn: (event: string, fields: Record<string, unknown> = {}) =>
      logWarn(event, { request_id: requestId, route, ...fields }),
    error: (event: string, fields: Record<string, unknown> = {}) =>
      logError(event, { request_id: requestId, route, ...fields }),
  };

  try {
    return baseCreateContext({
      user,
      container,
      logger,
      requestMeta: {
        requestId,
        route,
        startedAt,
        method: opts.req.method,
        path: new URL(opts.req.url).pathname,
        userAgent: opts.req.headers.get("user-agent"),
      },
    });
  } catch (error) {
    const details = serializeError(error);
    logError("trpc.context.failed", {
      request_id: requestId,
      route,
      error_code: "CONTEXT_FAILED",
      error_name: details.name ?? null,
      error_message: details.message,
      latency_ms: Date.now() - startedAt,
    });
    throw error;
  }
}
