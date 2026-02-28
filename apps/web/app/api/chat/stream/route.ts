import { createContainer } from "@/src/server/container";
import { resolveApiUserFromAccessToken } from "@/src/server/auth";
import {
  approxTokens,
  logError,
  logInfo,
  logWarn,
  serializeError,
} from "@/src/server/logger";
import {
  buildDegradedBudget,
  consumeChatRateLimit,
  getUsageWindow,
  projectTotalTokens,
  resolveChatBudgetDegradePolicy,
  resolveChatMaxInputTokens,
  resolveChatRateLimits,
  resolveModelPricingFromEnv,
  resolveTokenHardCaps,
  wouldExceedChatMaxInputTokens,
  wouldExceedTokenHardCap,
} from "@daemon/api";
import { DEFAULT_AGENT_CONFIG, ForbiddenError, IdempotencyConflictError, NotFoundError } from "@daemon/domain";

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

const DEFAULT_BUDGET = {
  modelWindow: Number(process.env.MODEL_CONTEXT_WINDOW ?? 128000),
  reserveOutputTokens: Number(process.env.RESERVE_OUTPUT_TOKENS ?? 2048),
  reserveToolTokens: Number(process.env.RESERVE_TOOL_TOKENS ?? 512),
  memoryTopK: Number(process.env.MEMORY_TOPK ?? 8),
  recentMessages: Number(process.env.RECENT_MESSAGES ?? 20),
};
const DEFAULT_MODEL_PRICING = resolveModelPricingFromEnv(env.OPENAI_MODEL, process.env);
const ROUTE_PATH = "/api/chat/stream";
const CHAT_LATENCY_ALERT_MS = Number(process.env.CHAT_LATENCY_ALERT_MS ?? 2500);

type ChatStreamInput = {
  agentId: string;
  sessionKey: string;
  userInput: string;
  system?: string;
  idempotencyKey?: string;
};

type ChatStreamRouteEnv = Record<string, string | undefined> & {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  OPENAI_MODEL: string;
  OPENAI_FALLBACK_MODEL?: string;
  OPENAI_EMBED_MODEL: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  LLM_PROVIDER_NAME?: "openai" | "deepseek";
  LLM_COMPATIBILITY?: "strict" | "compatible";
  EMBEDDING_MODE?: "remote" | "local";
  ALLOW_LOCAL_EMBEDDING_FALLBACK?: string;
  LOCAL_EMBED_DIMENSIONS?: string;
};

type ChatStreamRouteDeps = {
  env: ChatStreamRouteEnv;
  defaultBudget: typeof DEFAULT_BUDGET;
  defaultModelPricing: ReturnType<typeof resolveModelPricingFromEnv>;
  routePath: string;
  chatLatencyAlertMs: number;
  createContainer: typeof createContainer;
  resolveApiUserFromAccessToken: typeof resolveApiUserFromAccessToken;
  approxTokens: typeof approxTokens;
  serializeError: typeof serializeError;
  logInfo: typeof logInfo;
  logWarn: typeof logWarn;
  logError: typeof logError;
};

const defaultRouteDeps: ChatStreamRouteDeps = {
  env,
  defaultBudget: DEFAULT_BUDGET,
  defaultModelPricing: DEFAULT_MODEL_PRICING,
  routePath: ROUTE_PATH,
  chatLatencyAlertMs: CHAT_LATENCY_ALERT_MS,
  createContainer,
  resolveApiUserFromAccessToken,
  approxTokens,
  serializeError,
  logInfo,
  logWarn,
  logError,
};

const sendEvent = (controller: ReadableStreamDefaultController, data: unknown) => {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(payload));
};

export const createPostHandler = (
  overrides: Partial<ChatStreamRouteDeps> = {}
) => {
  const deps = {
    ...defaultRouteDeps,
    ...overrides,
  } satisfies ChatStreamRouteDeps;
  const {
    env,
    defaultBudget,
    defaultModelPricing,
    routePath,
    chatLatencyAlertMs,
    createContainer,
    resolveApiUserFromAccessToken,
    approxTokens,
    serializeError,
    logInfo,
    logWarn,
    logError,
  } = deps;

  return async (req: Request) => {
    const startedAt = Date.now();
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      logError("chat_stream.server_config_error", {
        request_id: requestId,
        route: routePath,
        error_code: "SERVER_CONFIG",
      });
      return new Response("Missing SUPABASE_URL or SUPABASE_ANON_KEY", { status: 500 });
    }

    const accessToken = req.headers.get("x-access-token");
    const user = await resolveApiUserFromAccessToken({
      supabaseUrl: env.SUPABASE_URL,
      supabaseAnonKey: env.SUPABASE_ANON_KEY,
      accessToken,
    });

    if (!user) {
      logWarn("chat_stream.unauthorized", {
        request_id: requestId,
        route: routePath,
        error_code: "UNAUTHORIZED",
        latency_ms: Date.now() - startedAt,
      });
      return new Response("Unauthorized", { status: 401 });
    }

    let body: ChatStreamInput;
    try {
      body = (await req.json()) as ChatStreamInput;
    } catch {
      logWarn("chat_stream.invalid_json", {
        request_id: requestId,
        route: routePath,
        user_id: user.id,
        error_code: "BAD_REQUEST",
        latency_ms: Date.now() - startedAt,
      });
      return new Response("Invalid JSON body", { status: 400 });
    }

    if (!body.agentId || !body.sessionKey || !body.userInput) {
      logWarn("chat_stream.invalid_input", {
        request_id: requestId,
        route: routePath,
        user_id: user.id,
        agent_id: body.agentId ?? null,
        error_code: "BAD_REQUEST",
        latency_ms: Date.now() - startedAt,
      });
      return new Response("Missing agentId/sessionKey/userInput", { status: 400 });
    }

    const container = createContainer(env, accessToken ?? undefined);
    const appendAuditEvent = async (input: {
      eventType: string;
      payload: Record<string, unknown>;
    }) => {
      if (!container.ports?.audit) return;
      try {
        await container.ports.audit.insertAuditEvent({
          tenantId: null,
          agentId: body.agentId,
          eventType: input.eventType,
          payload: input.payload,
          createdAt: container.ports.clock.now(),
        });
      } catch {
        logError("chat_stream.audit_write_failed", {
          request_id: requestId,
          route: routePath,
          user_id: user.id,
          agent_id: body.agentId,
          audit_event_type: input.eventType,
          error_code: "AUDIT_WRITE_FAILED",
        });
      }
    };

    let agentRecord;
    try {
      agentRecord = await container.agent.getAgent(body.agentId, user.id);
    } catch (error) {
      if (error instanceof NotFoundError) {
        logWarn("chat_stream.agent_not_found", {
          request_id: requestId,
          route: routePath,
          user_id: user.id,
          agent_id: body.agentId,
          error_code: "NOT_FOUND",
          latency_ms: Date.now() - startedAt,
        });
        return new Response("Agent not found", { status: 404 });
      }
      if (error instanceof ForbiddenError) {
        logWarn("chat_stream.agent_forbidden", {
          request_id: requestId,
          route: routePath,
          user_id: user.id,
          agent_id: body.agentId,
          error_code: "FORBIDDEN",
          latency_ms: Date.now() - startedAt,
        });
        return new Response("Agent access denied", { status: 403 });
      }
      const details = serializeError(error);
      logError("chat_stream.agent_access_check_failed", {
        request_id: requestId,
        route: routePath,
        user_id: user.id,
        agent_id: body.agentId,
        error_code: "AGENT_ACCESS_CHECK_FAILED",
        error_name: details.name ?? null,
        error_message: details.message,
        latency_ms: Date.now() - startedAt,
      });
      return new Response("Agent access check failed", { status: 500 });
    }

    const rateLimits = resolveChatRateLimits(env);
    if (rateLimits.qps || rateLimits.qpm) {
      const rateCheck = await consumeChatRateLimit({
        store: container.ports?.rateLimit,
        key: `${user.id}:${body.agentId}`,
        qps: rateLimits.qps,
        qpm: rateLimits.qpm,
      });
      if (!rateCheck.allowed) {
        logWarn("chat_stream.rate_limited", {
          request_id: requestId,
          route: routePath,
          user_id: user.id,
          agent_id: body.agentId,
          session_key: body.sessionKey,
          model: env.OPENAI_MODEL,
          qps_limit: rateLimits.qps ?? null,
          qpm_limit: rateLimits.qpm ?? null,
          retry_after_ms: rateCheck.retryAfterMs,
          error_code: "RATE_LIMITED",
          latency_ms: Date.now() - startedAt,
        });
        await appendAuditEvent({
          eventType: "chat_rate_limited",
          payload: {
            userId: user.id,
            sessionKey: body.sessionKey,
            qpsLimit: rateLimits.qps ?? null,
            qpmLimit: rateLimits.qpm ?? null,
            retryAfterMs: rateCheck.retryAfterMs,
          },
        });
        return new Response("chat rate limit exceeded", {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(rateCheck.retryAfterMs / 1000)),
          },
        });
      }
    }

    const idempotencyKey = req.headers.get("x-idempotency-key") ?? body.idempotencyKey ?? undefined;
    const userTokens = approxTokens(body.userInput);
    const maxInputTokens = resolveChatMaxInputTokens(env);
    if (
      maxInputTokens &&
      wouldExceedChatMaxInputTokens({
        incomingUserTokens: userTokens,
        maxInputTokens,
      })
    ) {
      logWarn("chat_stream.input_too_large", {
        request_id: requestId,
        route: routePath,
        user_id: user.id,
        agent_id: body.agentId,
        session_key: body.sessionKey,
        idempotency_key: idempotencyKey ?? null,
        model: env.OPENAI_MODEL,
        input_tokens: userTokens,
        max_input_tokens: maxInputTokens,
        error_code: "INPUT_TOO_LARGE",
        latency_ms: Date.now() - startedAt,
      });
      await appendAuditEvent({
        eventType: "chat_input_too_large",
        payload: {
          userId: user.id,
          sessionKey: body.sessionKey,
          inputTokens: userTokens,
          maxInputTokens,
        },
      });
      return new Response("chat input exceeds max token limit", { status: 413 });
    }
    const fallbackModel = env.OPENAI_FALLBACK_MODEL?.trim() || undefined;
    const routeStrategy = fallbackModel ? "primary_then_fallback" : "primary_only";
    const agentConfig = { ...DEFAULT_AGENT_CONFIG, ...(agentRecord.config ?? {}) };
    const configuredBudget = {
      ...defaultBudget,
      ...(agentConfig.memoryTopK ? { memoryTopK: agentConfig.memoryTopK } : {}),
      ...(agentConfig.recentMessages ? { recentMessages: agentConfig.recentMessages } : {}),
    };
    const systemPrompt = agentConfig.systemPrompt || body.system || "You are a helpful AI assistant.";

    const hardCaps = resolveTokenHardCaps(env);
    const degradePolicy = resolveChatBudgetDegradePolicy(env, configuredBudget);
    let effectiveBudget = { ...configuredBudget };
    let budgetDegraded: null | {
      period: "day" | "month";
      capTokens: number;
      usedTokens: number;
      projectedTokensBefore: number;
      projectedTokensAfter: number;
    } = null;
    if (hardCaps.dailyTokens || hardCaps.monthlyTokens) {
      const periods: Array<["day" | "month", number | undefined]> = [
        ["day", hardCaps.dailyTokens],
        ["month", hardCaps.monthlyTokens],
      ];
      for (const [period, cap] of periods) {
        if (!cap) continue;
        const window = getUsageWindow(period);
        const summary = await container.ports.usage.sumUsage({
          agentId: body.agentId,
          from: window.from,
          to: window.to,
        });
        const usedTokens = (summary.tokensIn ?? 0) + (summary.tokensOut ?? 0);
        const projectedTokens = projectTotalTokens({
          usage: summary,
          incomingUserTokens: userTokens,
          reserveOutputTokens: effectiveBudget.reserveOutputTokens,
        });
        if (
          wouldExceedTokenHardCap({
            cap,
            usage: summary,
            incomingUserTokens: userTokens,
            reserveOutputTokens: effectiveBudget.reserveOutputTokens,
          })
        ) {
          if (!budgetDegraded && degradePolicy.enabled) {
            const degradedBudgetResult = buildDegradedBudget(configuredBudget, degradePolicy);
            if (degradedBudgetResult.degraded) {
              const projectedWithDegradedBudget = projectTotalTokens({
                usage: summary,
                incomingUserTokens: userTokens,
                reserveOutputTokens: degradedBudgetResult.budget.reserveOutputTokens,
              });
              if (projectedWithDegradedBudget <= cap) {
                effectiveBudget = degradedBudgetResult.budget;
                budgetDegraded = {
                  period,
                  capTokens: cap,
                  usedTokens,
                  projectedTokensBefore: projectedTokens,
                  projectedTokensAfter: projectedWithDegradedBudget,
                };
                logWarn("chat_stream.budget_degraded", {
                  request_id: requestId,
                  route: routePath,
                  user_id: user.id,
                  agent_id: body.agentId,
                  session_key: body.sessionKey,
                  idempotency_key: idempotencyKey ?? null,
                  model: env.OPENAI_MODEL,
                  period,
                  cap_tokens: cap,
                  used_tokens: usedTokens,
                  incoming_tokens: userTokens,
                  projected_tokens_before: projectedTokens,
                  projected_tokens_after: projectedWithDegradedBudget,
                  reserve_output_tokens_before: configuredBudget.reserveOutputTokens,
                  reserve_output_tokens_after: effectiveBudget.reserveOutputTokens,
                  memory_top_k_before: configuredBudget.memoryTopK,
                  memory_top_k_after: effectiveBudget.memoryTopK,
                  recent_messages_before: configuredBudget.recentMessages,
                  recent_messages_after: effectiveBudget.recentMessages,
                  error_code: "BUDGET_DEGRADED",
                  latency_ms: Date.now() - startedAt,
                });
                await appendAuditEvent({
                  eventType: "chat_budget_degraded",
                  payload: {
                    userId: user.id,
                    sessionKey: body.sessionKey,
                    period,
                    capTokens: cap,
                    usedTokens,
                    incomingTokens: userTokens,
                    projectedTokensBefore: projectedTokens,
                    projectedTokensAfter: projectedWithDegradedBudget,
                    reserveOutputTokensBefore: configuredBudget.reserveOutputTokens,
                    reserveOutputTokensAfter: effectiveBudget.reserveOutputTokens,
                    memoryTopKBefore: configuredBudget.memoryTopK,
                    memoryTopKAfter: effectiveBudget.memoryTopK,
                    recentMessagesBefore: configuredBudget.recentMessages,
                    recentMessagesAfter: effectiveBudget.recentMessages,
                  },
                });
                continue;
              }
            }
          }
          logWarn("chat_stream.hard_cap_exceeded", {
            request_id: requestId,
            route: routePath,
            user_id: user.id,
            agent_id: body.agentId,
            session_key: body.sessionKey,
            idempotency_key: idempotencyKey ?? null,
            model: env.OPENAI_MODEL,
            period,
            cap_tokens: cap,
            used_tokens: usedTokens,
            incoming_tokens: userTokens,
            reserve_output_tokens: effectiveBudget.reserveOutputTokens,
            projected_tokens: projectedTokens,
            budget_degraded: Boolean(budgetDegraded),
            error_code: "TOKEN_HARD_CAP_EXCEEDED",
            latency_ms: Date.now() - startedAt,
          });
          await appendAuditEvent({
            eventType: "chat_hard_cap_exceeded",
            payload: {
              userId: user.id,
              sessionKey: body.sessionKey,
              period,
              capTokens: cap,
              usedTokens,
              incomingTokens: userTokens,
              reserveOutputTokens: effectiveBudget.reserveOutputTokens,
              projectedTokens,
              budgetDegraded: Boolean(budgetDegraded),
            },
          });
          return new Response(`${period} token hard cap exceeded`, { status: 429 });
        }
      }
    }

    let result;
    try {
      result = await container.chat.chatTurnStream(
        body.agentId,
        body.sessionKey,
        body.userInput,
        {
          system: systemPrompt,
          constraints: [],
          taskState: null,
          memoryTopK: effectiveBudget.memoryTopK,
          recentMessages: effectiveBudget.recentMessages,
          memoryScope: {
            scopeType: "user",
            scopeId: user.id,
          },
          idempotencyKey,
          model: env.OPENAI_MODEL,
          pricing: defaultModelPricing,
          usageMeta: budgetDegraded
            ? {
                model_route_strategy: routeStrategy,
                model_route_primary: env.OPENAI_MODEL,
                model_route_fallback: fallbackModel ?? null,
                budget_degraded: true,
                budget_degrade_period: budgetDegraded.period,
                reserve_output_tokens_before: configuredBudget.reserveOutputTokens,
                reserve_output_tokens_after: effectiveBudget.reserveOutputTokens,
                memory_top_k_before: configuredBudget.memoryTopK,
                memory_top_k_after: effectiveBudget.memoryTopK,
                recent_messages_before: configuredBudget.recentMessages,
                recent_messages_after: effectiveBudget.recentMessages,
                projected_tokens_before: budgetDegraded.projectedTokensBefore,
                projected_tokens_after: budgetDegraded.projectedTokensAfter,
              }
            : {
                model_route_strategy: routeStrategy,
                model_route_primary: env.OPENAI_MODEL,
                model_route_fallback: fallbackModel ?? null,
              },
          budget: effectiveBudget,
        }
      );
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        logWarn("chat_stream.idempotency_conflict", {
          request_id: requestId,
          route: routePath,
          user_id: user.id,
          agent_id: body.agentId,
          idempotency_key: idempotencyKey ?? null,
          model: env.OPENAI_MODEL,
          error_code: "CONFLICT",
          latency_ms: Date.now() - startedAt,
        });
        return new Response(error.message, { status: 409 });
      }
      const details = serializeError(error);
      logError("chat_stream.start_failed", {
        request_id: requestId,
        route: routePath,
        user_id: user.id,
        agent_id: body.agentId,
        idempotency_key: idempotencyKey ?? null,
        model: env.OPENAI_MODEL,
        error_code: "UPSTREAM_ERROR",
        error_name: details.name ?? null,
        error_message: details.message,
        latency_ms: Date.now() - startedAt,
      });
      return new Response("Chat stream failed to start", { status: 500 });
    }

    const iterator = result.stream[Symbol.asyncIterator]();
    let assistantText = "";

    const stream = new ReadableStream({
      async start(controller) {
        sendEvent(controller, { type: "meta", sessionId: result.sessionId, requestId });
        try {
          while (true) {
            const { value, done } = await iterator.next();
            if (done) break;
            assistantText += value ?? "";
            sendEvent(controller, { type: "chunk", value });
          }
          sendEvent(controller, { type: "done" });
          const latencyMs = Date.now() - startedAt;
          logInfo("chat_stream.completed", {
            request_id: requestId,
            route: routePath,
            user_id: user.id,
            agent_id: body.agentId,
            session_id: result.sessionId,
            idempotency_key: idempotencyKey ?? null,
            model: env.OPENAI_MODEL,
            budget_degraded: Boolean(budgetDegraded),
            tokens_in: userTokens,
            tokens_out: approxTokens(assistantText),
            latency_ms: latencyMs,
          });
          if (latencyMs > chatLatencyAlertMs) {
            logWarn("chat_stream.slow", {
              request_id: requestId,
              route: routePath,
              user_id: user.id,
              agent_id: body.agentId,
              session_id: result.sessionId,
              idempotency_key: idempotencyKey ?? null,
              model: env.OPENAI_MODEL,
              latency_ms: latencyMs,
              threshold_ms: chatLatencyAlertMs,
              error_code: "SLOW_REQUEST",
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "stream error";
          sendEvent(controller, { type: "error", message });
          const details = serializeError(error);
          logError("chat_stream.failed", {
            request_id: requestId,
            route: routePath,
            user_id: user.id,
            agent_id: body.agentId,
            session_id: result.sessionId,
            idempotency_key: idempotencyKey ?? null,
            model: env.OPENAI_MODEL,
            budget_degraded: Boolean(budgetDegraded),
            tokens_in: userTokens,
            tokens_out: approxTokens(assistantText),
            error_code: "STREAM_ERROR",
            error_name: details.name ?? null,
            error_message: details.message,
            latency_ms: Date.now() - startedAt,
          });
        } finally {
          controller.close();
        }
      },
      async cancel() {
        logWarn("chat_stream.cancelled", {
          request_id: requestId,
          route: routePath,
          user_id: user.id,
          agent_id: body.agentId,
          session_id: result.sessionId,
          idempotency_key: idempotencyKey ?? null,
          model: env.OPENAI_MODEL,
          budget_degraded: Boolean(budgetDegraded),
          tokens_in: userTokens,
          tokens_out: approxTokens(assistantText),
          latency_ms: Date.now() - startedAt,
        });
        if (iterator.return) {
          await iterator.return();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "X-Request-Id": requestId,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  };
};

export const POST = createPostHandler();
