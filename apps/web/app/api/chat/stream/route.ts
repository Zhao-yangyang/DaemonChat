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
import { createChatService, DEFAULT_AGENT_CONFIG, DEFAULT_SYSTEM_PROMPT, ForbiddenError, IdempotencyConflictError, NotFoundError } from "@daemon/domain";
import { createLlmFromAgentConfig } from "@daemon/adapters-llm-vercel";

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY:
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

const DEFAULT_BUDGET = {
  modelWindow: Number(process.env.MODEL_CONTEXT_WINDOW ?? 128000),
  reserveOutputTokens: Number(process.env.RESERVE_OUTPUT_TOKENS ?? 2048),
  reserveToolTokens: Number(process.env.RESERVE_TOOL_TOKENS ?? 512),
  memoryTopK: Number(process.env.MEMORY_TOPK ?? 8),
  recentMessages: Number(process.env.RECENT_MESSAGES ?? 20),
};
const ROUTE_PATH = "/api/chat/stream";
const CHAT_LATENCY_ALERT_MS = Number(process.env.CHAT_LATENCY_ALERT_MS ?? 2500);

type ChatStreamInput = {
  agentId: string;
  sessionKey: string;
  userInput: string;
  system?: string;
  model?: string;
  idempotencyKey?: string;
  imageUrls?: Array<{ url: string; mimeType?: string }>;
};

type ChatStreamRouteEnv = Record<string, string | undefined> & {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
};

type ChatStreamRouteDeps = {
  env: ChatStreamRouteEnv;
  defaultBudget: typeof DEFAULT_BUDGET;
  routePath: string;
  chatLatencyAlertMs: number;
  createContainer: typeof createContainer;
  resolveApiUserFromAccessToken: typeof resolveApiUserFromAccessToken;
  approxTokens: typeof approxTokens;
  serializeError: typeof serializeError;
  logInfo: typeof logInfo;
  logWarn: typeof logWarn;
  logError: typeof logError;
  createChatService: typeof createChatService;
  createLlmFromAgentConfig: typeof createLlmFromAgentConfig;
};

const defaultRouteDeps: ChatStreamRouteDeps = {
  env,
  defaultBudget: DEFAULT_BUDGET,
  routePath: ROUTE_PATH,
  chatLatencyAlertMs: CHAT_LATENCY_ALERT_MS,
  createContainer,
  resolveApiUserFromAccessToken,
  approxTokens,
  serializeError,
  logInfo,
  logWarn,
  logError,
  createChatService,
  createLlmFromAgentConfig,
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
    routePath,
    chatLatencyAlertMs,
    createContainer,
    resolveApiUserFromAccessToken,
    approxTokens,
    serializeError,
    logInfo,
    logWarn,
    logError,
    createChatService,
    createLlmFromAgentConfig,
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
          model: "(unknown)",
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
        model: body.model || "(unknown)",
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
    const agentConfig = { ...DEFAULT_AGENT_CONFIG, ...(agentRecord.config ?? {}) };
    const llmProvider = agentConfig.llmProvider;
    if (!llmProvider || !llmProvider.apiKey || !llmProvider.baseURL || !llmProvider.model) {
      logWarn("chat_stream.llm_not_configured", {
        request_id: requestId,
        route: routePath,
        user_id: user.id,
        agent_id: body.agentId,
        error_code: "LLM_NOT_CONFIGURED",
        latency_ms: Date.now() - startedAt,
      });
      return new Response("Agent 未配置 LLM Provider，请在 Agent 设置中配置 API Key、Base URL 和模型", { status: 400 });
    }

    // Dynamically create LLM from Agent config
    let agentLlm;
    try {
      const finalModelName = llmProvider.model;
      agentLlm = createLlmFromAgentConfig(
        { ...llmProvider, model: finalModelName },
        { temperature: agentConfig.temperature },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "LLM 创建失败";
      logError("chat_stream.llm_create_failed", {
        request_id: requestId,
        route: routePath,
        user_id: user.id,
        agent_id: body.agentId,
        error_code: "LLM_CREATE_FAILED",
        error_message: message,
        latency_ms: Date.now() - startedAt,
      });
      return new Response(message, { status: 400 });
    }

    // Create a new chat service with the real per-agent LLM
    // (monkey-patching container.ports.llm does NOT work because
    //  createChatService captures llm in a closure at construction time)
    const agentChatService = createChatService({
      jobs: container.ports.jobs,
      sessions: container.ports.sessions,
      transcripts: container.ports.transcripts,
      memory: container.ports.memory,
      usage: container.ports.usage,
      llm: agentLlm,
      clock: container.ports.clock,
      tokenizer: container.ports.tokenizer,
    });

    const selectedModel = llmProvider.model;
    const selectedModelPricing = resolveModelPricingFromEnv(selectedModel, env) ?? undefined;
    const configuredBudget = {
      ...defaultBudget,
      ...(agentConfig.memoryTopK ? { memoryTopK: agentConfig.memoryTopK } : {}),
      ...(agentConfig.recentMessages ? { recentMessages: agentConfig.recentMessages } : {}),
    };
    const systemPrompt = agentConfig.systemPrompt || body.system || DEFAULT_SYSTEM_PROMPT;

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
                  model: selectedModel,
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
            model: selectedModel,
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

    const abortController = new AbortController();
    const syncAbortFromRequest = () => {
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
    };
    req.signal.addEventListener("abort", syncAbortFromRequest);
    if (req.signal.aborted) {
      syncAbortFromRequest();
    }

    let result;
    try {
      result = await agentChatService.chatTurnStream(
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
          model: selectedModel,
          pricing: selectedModelPricing,
          usageMeta: budgetDegraded
            ? {
                model_route_strategy: "primary_only",
                model_route_primary: selectedModel,
                model_route_fallback: null,
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
                model_route_strategy: "primary_only",
                model_route_primary: selectedModel,
                model_route_fallback: null,
              },
          imageUrls: body.imageUrls,
          budget: effectiveBudget,
          abortSignal: abortController.signal,
        }
      );
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        req.signal.removeEventListener("abort", syncAbortFromRequest);
        logWarn("chat_stream.idempotency_conflict", {
          request_id: requestId,
          route: routePath,
          user_id: user.id,
          agent_id: body.agentId,
          idempotency_key: idempotencyKey ?? null,
          model: selectedModel,
          error_code: "CONFLICT",
          latency_ms: Date.now() - startedAt,
        });
        return new Response(error.message, { status: 409 });
      }
      req.signal.removeEventListener("abort", syncAbortFromRequest);
      const details = serializeError(error);
      logError("chat_stream.start_failed", {
        request_id: requestId,
        route: routePath,
        user_id: user.id,
        agent_id: body.agentId,
        idempotency_key: idempotencyKey ?? null,
        model: selectedModel,
        error_code: "UPSTREAM_ERROR",
        error_name: details.name ?? null,
        error_message: details.message,
        latency_ms: Date.now() - startedAt,
      });
      return new Response("Chat stream failed to start", { status: 500 });
    }

    const iterator = result.stream[Symbol.asyncIterator]();
    let assistantText = "";
    let streamClosed = false;

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
          try {
            if (!container.ports?.sessions || !container.ports?.transcripts || !container.session) {
              /* skip when container is mocked without these ports (e.g. in tests) */
            } else {
              const session = await container.ports.sessions.getCurrentSession({
                agentId: body.agentId,
                sessionKey: body.sessionKey,
              });
              if (session && !session.displayName?.trim()) {
                const events = await container.ports.transcripts.listRecentEvents({
                  agentId: body.agentId,
                  sessionId: result.sessionId,
                  limit: 200,
                });
                const userMsgCount = events.filter((e) => e.type === "user_message").length;
                if (userMsgCount === 1) {
                  const raw = (body.userInput ?? "").trim().replace(/\s+/g, " ");
                  const displayName = raw.length > 0 ? raw.slice(0, 40) : "新会话";
                  await container.session.renameSession(
                    body.agentId,
                    result.sessionId,
                    displayName,
                    user.id
                  );
                }
              }
            }
          } catch (renameErr) {
            logWarn("chat_stream.auto_rename_failed", {
              request_id: requestId,
              route: routePath,
              user_id: user.id,
              agent_id: body.agentId,
              session_id: result.sessionId,
              error_message: renameErr instanceof Error ? renameErr.message : String(renameErr),
            });
          }
          logInfo("chat_stream.completed", {
            request_id: requestId,
            route: routePath,
            user_id: user.id,
            agent_id: body.agentId,
            session_id: result.sessionId,
            idempotency_key: idempotencyKey ?? null,
            model: selectedModel,
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
              model: selectedModel,
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
            model: selectedModel,
            budget_degraded: Boolean(budgetDegraded),
            tokens_in: userTokens,
            tokens_out: approxTokens(assistantText),
            error_code: "STREAM_ERROR",
            error_name: details.name ?? null,
            error_message: details.message,
            latency_ms: Date.now() - startedAt,
          });
        } finally {
          if (!streamClosed) {
            streamClosed = true;
            controller.close();
          }
          req.signal.removeEventListener("abort", syncAbortFromRequest);
        }
      },
      async cancel() {
        syncAbortFromRequest();
        logWarn("chat_stream.cancelled", {
          request_id: requestId,
          route: routePath,
          user_id: user.id,
          agent_id: body.agentId,
          session_id: result.sessionId,
          idempotency_key: idempotencyKey ?? null,
          model: selectedModel,
          budget_degraded: Boolean(budgetDegraded),
          tokens_in: userTokens,
          tokens_out: approxTokens(assistantText),
          latency_ms: Date.now() - startedAt,
        });
        if (iterator.return) {
          await iterator.return();
        }
        req.signal.removeEventListener("abort", syncAbortFromRequest);
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
