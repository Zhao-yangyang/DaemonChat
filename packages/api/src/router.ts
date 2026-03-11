import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  API_KEY_REDACTED,
  DEFAULT_AGENT_CONFIG,
  DEFAULT_SYSTEM_PROMPT,
  ForbiddenError,
  IdempotencyConflictError,
  NotFoundError,
} from "@daemon/domain";
import { resolveModelPricingFromEnv } from "./pricing";
import {
  buildDegradedBudget,
  getUsageWindow,
  resolveChatMaxInputTokens,
  resolveTokenHardCaps,
  resolveChatBudgetDegradePolicy,
  wouldExceedChatMaxInputTokens,
  wouldExceedTokenHardCap,
  projectTotalTokens,
} from "./budget";
import { consumeChatRateLimit, resolveChatRateLimits } from "./rateLimit";
import type { ApiContext } from "./context";

const t = initTRPC.context<ApiContext>().create();

type SupabaseLikeError = {
  code?: unknown;
  message?: unknown;
};

const isSupabaseLikeError = (error: unknown): error is SupabaseLikeError => {
  if (!error || typeof error !== "object") return false;
  const maybe = error as SupabaseLikeError;
  return typeof maybe.message === "string" || typeof maybe.code === "string";
};

const mapInfrastructureErrorToTrpc = (error: unknown): TRPCError | null => {
  if (error instanceof TRPCError) {
    return error;
  }
  if (!isSupabaseLikeError(error)) {
    return null;
  }

  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";
  const loweredMessage = message.toLowerCase();

  if (
    code === "42P01" ||
    (loweredMessage.includes("relation") && loweredMessage.includes("agents"))
  ) {
    return new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Supabase schema is not ready. Apply schema.sql and rls.sql before using agents.",
      cause: error,
    });
  }

  if (code === "42501" || loweredMessage.includes("permission denied")) {
    return new TRPCError({
      code: "FORBIDDEN",
      message:
        "Supabase denied access to agents. Verify RLS policies in rls.sql and your login session.",
      cause: error,
    });
  }

  return null;
};

const throwMappedInfrastructureError = (error: unknown): never => {
  const mapped = mapInfrastructureErrorToTrpc(error);
  if (mapped) {
    throw mapped;
  }
  throw error;
};

const withInfrastructureErrorMapping = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    throwMappedInfrastructureError(error);
    throw error;
  }
};

const requireUser = (ctx: ApiContext) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return ctx.user;
};

/** 剥离 config.llmProvider.apiKey，用于写入 DB 或克隆时防止泄露 */
function stripApiKeyFromConfig(
  config: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out = config && typeof config === "object" ? { ...config } : {};
  if (out?.llmProvider && typeof out.llmProvider === "object") {
    const lp = { ...(out.llmProvider as Record<string, unknown>) };
    delete lp.apiKey;
    out.llmProvider = lp;
  }
  return out;
}

/** 将 config.llmProvider.apiKey 置为 REDACTED，用于返回客户端前防泄露 */
function redactApiKeyInConfig(config: Record<string, unknown> | null | undefined): void {
  if (config?.llmProvider && typeof config.llmProvider === "object") {
    (config.llmProvider as Record<string, unknown>).apiKey = API_KEY_REDACTED;
  }
}

const ensureAgentAccess = async (ctx: ApiContext, agentId: string) => {
  const user = requireUser(ctx);
  try {
    await ctx.container.agent.getAgent(agentId, user.id);
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: error.message,
      });
    }
    if (error instanceof ForbiddenError) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: error.message,
      });
    }
    throwMappedInfrastructureError(error);
  }
  return user;
};

const DEFAULT_BUDGET = {
  modelWindow: Number(process.env.MODEL_CONTEXT_WINDOW ?? 128000),
  reserveOutputTokens: Number(process.env.RESERVE_OUTPUT_TOKENS ?? 2048),
  reserveToolTokens: Number(process.env.RESERVE_TOOL_TOKENS ?? 512),
  memoryTopK: Number(process.env.MEMORY_TOPK ?? 8),
  recentMessages: Number(process.env.RECENT_MESSAGES ?? 20),
};
const DEFAULT_CHAT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const DEFAULT_CHAT_MODEL_PRICING = resolveModelPricingFromEnv(DEFAULT_CHAT_MODEL, process.env);
const CHAT_LATENCY_ALERT_MS = Number(process.env.CHAT_LATENCY_ALERT_MS ?? 2500);
const approxTokens = (text: string) => Math.ceil(text.length / 4);

const logFromContext = (
  ctx: ApiContext,
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown> = {},
) => {
  const requestMeta = ctx.requestMeta;
  const baseFields: Record<string, unknown> = {
    request_id: requestMeta?.requestId ?? null,
    route: requestMeta?.route ?? "trpc",
    method: requestMeta?.method ?? null,
    path: requestMeta?.path ?? null,
    ...fields,
  };
  if (level === "error") {
    ctx.logger?.error(event, baseFields);
    return;
  }
  if (level === "warn") {
    ctx.logger?.warn(event, baseFields);
    return;
  }
  ctx.logger?.info(event, baseFields);
};

const appendAuditEvent = async (
  ctx: ApiContext,
  input: {
    agentId: string;
    eventType: string;
    payload: Record<string, unknown>;
  },
) => {
  try {
    await ctx.container.ports.audit.insertAuditEvent({
      tenantId: null,
      agentId: input.agentId,
      eventType: input.eventType,
      payload: input.payload,
      createdAt: ctx.container.ports.clock.now(),
    });
  } catch {
    logFromContext(ctx, "error", "trpc.audit.write_failed", {
      agent_id: input.agentId,
      audit_event_type: input.eventType,
      error_code: "AUDIT_WRITE_FAILED",
    });
  }
};

export const appRouter = t.router({
  agent: t.router({
    create: t.procedure
      .input(
        z.object({
          name: z.string().min(1),
          workspaceId: z.string().min(1).optional(),
          config: z
            .object({
              systemPrompt: z.string().optional(),
              memoryTopK: z.number().int().min(1).max(50).optional(),
              recentMessages: z.number().int().min(1).max(100).optional(),
              temperature: z.number().min(0).max(2).optional(),
              llmProvider: z
                .object({
                  model: z.string(),
                  baseURL: z.string(),
                  apiKey: z.string(),
                  presetId: z.string().optional(),
                  sdkProvider: z
                    .enum(["openai", "anthropic", "google", "deepseek", "xai", "mistral"])
                    .optional(),
                })
                .optional(),
            })
            .optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const user = requireUser(ctx);
        if (input.workspaceId && ctx.container.workspace) {
          try {
            await ctx.container.workspace.requirePermission(
              input.workspaceId,
              user.id,
              "create_agent",
            );
          } catch (e) {
            if (e instanceof ForbiddenError) {
              throw new TRPCError({ code: "FORBIDDEN", message: e.message });
            }
            throw e;
          }
        }
        return withInfrastructureErrorMapping(() =>
          ctx.container.agent.createAgent(user.id, input.name, input.config, input.workspaceId),
        );
      }),
    list: t.procedure
      .input(z.object({ workspaceId: z.string().min(1).optional() }).optional())
      .query(async ({ ctx, input }) => {
        const user = requireUser(ctx);
        const agents = await withInfrastructureErrorMapping(() =>
          ctx.container.agent.listAgents(
            user.id,
            input ? { workspaceId: input.workspaceId } : undefined,
          ),
        );
        return agents.map((agent) => {
          if (agent.config?.llmProvider?.apiKey) {
            agent.config.llmProvider.apiKey = API_KEY_REDACTED;
          }
          return agent;
        });
      }),
    get: t.procedure
      .input(z.object({ agentId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        const user = requireUser(ctx);
        const agent = await withInfrastructureErrorMapping(() =>
          ctx.container.agent.getAgent(input.agentId, user.id),
        );
        if (agent.config?.llmProvider?.apiKey) {
          agent.config.llmProvider.apiKey = API_KEY_REDACTED;
        }
        return agent;
      }),
    update: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          name: z.string().min(1).optional(),
          visibility: z.enum(["private", "workspace", "public"]).optional(),
          config: z
            .object({
              systemPrompt: z.string().optional(),
              memoryTopK: z.number().int().min(1).max(50).optional(),
              recentMessages: z.number().int().min(1).max(100).optional(),
              temperature: z.number().min(0).max(2).optional(),
              llmProvider: z
                .object({
                  model: z.string(),
                  baseURL: z.string(),
                  apiKey: z.string(),
                  presetId: z.string().optional(),
                  sdkProvider: z
                    .enum(["openai", "anthropic", "google", "deepseek", "xai", "mistral"])
                    .optional(),
                })
                .optional(),
            })
            .optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const user = requireUser(ctx);
        const existing = await withInfrastructureErrorMapping(() =>
          ctx.container.agent.getAgent(input.agentId, user.id),
        );
        if (input.config?.llmProvider?.apiKey === API_KEY_REDACTED) {
          input.config.llmProvider.apiKey = existing.config?.llmProvider?.apiKey ?? "";
        }
        if (existing.workspaceId && ctx.container.workspace) {
          try {
            await ctx.container.workspace.requirePermission(
              existing.workspaceId,
              user.id,
              "edit_agent",
              { agentOwnerUserId: existing.ownerUserId },
            );
          } catch (e) {
            if (e instanceof ForbiddenError) {
              throw new TRPCError({ code: "FORBIDDEN", message: e.message });
            }
            throw e;
          }
        }
        return withInfrastructureErrorMapping(() =>
          ctx.container.agent.updateAgent(input.agentId, user.id, {
            name: input.name,
            visibility: input.visibility,
            config: input.config,
          }),
        );
      }),
    delete: t.procedure
      .input(z.object({ agentId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const user = requireUser(ctx);
        const agent = await withInfrastructureErrorMapping(() =>
          ctx.container.agent.getAgent(input.agentId, user.id),
        );
        if (agent.workspaceId && ctx.container.workspace) {
          try {
            await ctx.container.workspace.requirePermission(
              agent.workspaceId,
              user.id,
              "delete_agent",
              { agentOwnerUserId: agent.ownerUserId },
            );
          } catch (e) {
            if (e instanceof ForbiddenError) {
              throw new TRPCError({ code: "FORBIDDEN", message: e.message });
            }
            throw e;
          }
        }
        return withInfrastructureErrorMapping(() =>
          ctx.container.agent.deleteAgent(input.agentId, user.id),
        );
      }),
  }),

  session: t.router({
    list: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          limit: z.number().int().min(1).max(100).default(20),
          includeArchived: z.boolean().default(false),
        }),
      )
      .query(async ({ ctx, input }) => {
        await ensureAgentAccess(ctx, input.agentId);
        return ctx.container.session.listRecentSessions(
          input.agentId,
          input.limit,
          input.includeArchived,
        );
      }),
    delete: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          sessionId: z.string().min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const user = await ensureAgentAccess(ctx, input.agentId);
        return withInfrastructureErrorMapping(() =>
          ctx.container.session.deleteSession(input.agentId, input.sessionId, user.id),
        );
      }),
    archive: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          sessionId: z.string().min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const user = await ensureAgentAccess(ctx, input.agentId);
        return withInfrastructureErrorMapping(() =>
          ctx.container.session.archiveSession(input.agentId, input.sessionId, user.id),
        );
      }),
    unarchive: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          sessionId: z.string().min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const user = await ensureAgentAccess(ctx, input.agentId);
        return withInfrastructureErrorMapping(() =>
          ctx.container.session.unarchiveSession(input.agentId, input.sessionId, user.id),
        );
      }),
    rename: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          sessionId: z.string().min(1),
          displayName: z.string().min(1).max(80),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const user = await ensureAgentAccess(ctx, input.agentId);
        return withInfrastructureErrorMapping(() =>
          ctx.container.session.renameSession(
            input.agentId,
            input.sessionId,
            input.displayName,
            user.id,
          ),
        );
      }),
    fork: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          parentSessionId: z.string().min(1),
          forkFromEventId: z.string().min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const user = await ensureAgentAccess(ctx, input.agentId);
        return withInfrastructureErrorMapping(() =>
          ctx.container.session.forkSession(
            input.agentId,
            input.parentSessionId,
            input.forkFromEventId,
            user.id,
          ),
        );
      }),
  }),

  transcript: t.router({
    list: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          sessionId: z.string().min(1),
          limit: z.number().int().min(1).max(200).default(50),
          parentSessionId: z.string().optional(),
          forkFromEventId: z.string().optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        await ensureAgentAccess(ctx, input.agentId);
        if (input.parentSessionId && input.forkFromEventId) {
          return ctx.container.ports.transcripts.listRecentEventsWithFork({
            agentId: input.agentId,
            sessionId: input.sessionId,
            parentSessionId: input.parentSessionId,
            forkUpToEventId: input.forkFromEventId,
            limit: input.limit,
          });
        }
        return ctx.container.transcript.loadRecentContext(
          input.agentId,
          input.sessionId,
          input.limit,
        );
      }),
  }),

  memory: t.router({
    list: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          limit: z.number().int().min(1).max(200).default(50),
          offset: z.number().int().min(0).default(0),
          type: z.enum(["fact", "rule", "preference", "task"]).optional(),
          sensitivity: z.enum(["public", "private", "secret"]).optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        await ensureAgentAccess(ctx, input.agentId);
        return ctx.container.memory.listMemoryItems(input.agentId, input.limit, {
          offset: input.offset || undefined,
          type: input.type,
          sensitivity: input.sensitivity,
        });
      }),
    search: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          query: z.string().min(1),
          topK: z.number().int().min(1).max(50).default(20),
        }),
      )
      .query(async ({ ctx, input }) => {
        await ensureAgentAccess(ctx, input.agentId);
        return ctx.container.memory.searchMemoryItems(input.agentId, input.query, input.topK);
      }),
    count: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
        }),
      )
      .query(async ({ ctx, input }) => {
        await ensureAgentAccess(ctx, input.agentId);
        return ctx.container.memory.countMemoryItems(input.agentId);
      }),
    create: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          scopeType: z.enum(["user", "team", "org"]),
          scopeId: z.string().min(1),
          type: z.enum(["fact", "rule", "preference", "task"]),
          content: z.string().min(1),
          tags: z.array(z.string()).default([]),
          sensitivity: z.enum(["public", "private", "secret"]),
          contextEligible: z.boolean().default(true),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const user = await ensureAgentAccess(ctx, input.agentId);
        if (input.scopeType !== "user" || input.scopeId !== user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "memory.create scope must be the current user",
          });
        }
        return ctx.container.memory.writeMemoryItem(input.agentId, {
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          type: input.type,
          content: input.content,
          tags: input.tags,
          sensitivity: input.sensitivity,
          contextEligible: input.contextEligible,
        });
      }),
    update: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          memoryId: z.string().min(1),
          content: z.string().min(1).optional(),
          tags: z.array(z.string()).optional(),
          sensitivity: z.enum(["public", "private", "secret"]).optional(),
          contextEligible: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await ensureAgentAccess(ctx, input.agentId);
        return withInfrastructureErrorMapping(() =>
          ctx.container.memory.updateMemoryItem(input.agentId, input.memoryId, {
            content: input.content,
            tags: input.tags,
            sensitivity: input.sensitivity,
            contextEligible: input.contextEligible,
          }),
        );
      }),
    delete: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          memoryId: z.string().min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await ensureAgentAccess(ctx, input.agentId);
        return withInfrastructureErrorMapping(() =>
          ctx.container.memory.deleteMemoryItem(input.agentId, input.memoryId),
        );
      }),
  }),

  usage: t.router({
    summary: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          period: z.enum(["day", "month"]).default("day"),
        }),
      )
      .query(async ({ ctx, input }) => {
        await ensureAgentAccess(ctx, input.agentId);
        const window = getUsageWindow(input.period);
        return ctx.container.ports.usage.sumUsage({
          agentId: input.agentId,
          from: window.from,
          to: window.to,
        });
      }),
    trend: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          period: z.enum(["day", "month"]).default("day"),
        }),
      )
      .query(async ({ ctx, input }) => {
        await ensureAgentAccess(ctx, input.agentId);
        const window = getUsageWindow(input.period);
        return ctx.container.ports.usage.seriesUsage({
          agentId: input.agentId,
          from: window.from,
          to: window.to,
          bucket: input.period === "day" ? "hour" : "day",
        });
      }),
  }),

  chat: t.router({
    turn: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          sessionKey: z.string().min(1),
          userInput: z.string().min(1),
          system: z.string().default(""),
          idempotencyKey: z.string().min(8).max(128).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const user = await ensureAgentAccess(ctx, input.agentId);
        const agentRecord = await ctx.container.agent.getAgent(input.agentId, user.id);
        const agentConfig = { ...DEFAULT_AGENT_CONFIG, ...(agentRecord.config ?? {}) };
        const configuredBudget = {
          ...DEFAULT_BUDGET,
          ...(agentConfig.memoryTopK ? { memoryTopK: agentConfig.memoryTopK } : {}),
          ...(agentConfig.recentMessages ? { recentMessages: agentConfig.recentMessages } : {}),
        };
        const systemPrompt = agentConfig.systemPrompt || input.system || DEFAULT_SYSTEM_PROMPT;
        const fallbackModel = process.env.OPENAI_FALLBACK_MODEL?.trim() || undefined;
        const routeStrategy = fallbackModel ? "primary_then_fallback" : "primary_only";
        const rateLimits = resolveChatRateLimits(process.env);
        if (rateLimits.qps || rateLimits.qpm) {
          const rateCheck = await consumeChatRateLimit({
            store: ctx.container.ports.rateLimit,
            key: `${user.id}:${input.agentId}`,
            qps: rateLimits.qps,
            qpm: rateLimits.qpm,
          });
          if (!rateCheck.allowed) {
            logFromContext(ctx, "warn", "trpc.chat.turn.rate_limited", {
              user_id: user.id,
              agent_id: input.agentId,
              session_key: input.sessionKey,
              model: DEFAULT_CHAT_MODEL,
              qps_limit: rateLimits.qps ?? null,
              qpm_limit: rateLimits.qpm ?? null,
              retry_after_ms: rateCheck.retryAfterMs,
              error_code: "RATE_LIMITED",
            });
            await appendAuditEvent(ctx, {
              agentId: input.agentId,
              eventType: "chat_rate_limited",
              payload: {
                userId: user.id,
                sessionKey: input.sessionKey,
                qpsLimit: rateLimits.qps ?? null,
                qpmLimit: rateLimits.qpm ?? null,
                retryAfterMs: rateCheck.retryAfterMs,
              },
            });
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: "chat rate limit exceeded",
            });
          }
        }

        const hardCaps = resolveTokenHardCaps(process.env);
        const incomingUserTokens = approxTokens(input.userInput);
        const maxInputTokens = resolveChatMaxInputTokens(process.env);
        if (
          maxInputTokens &&
          wouldExceedChatMaxInputTokens({
            incomingUserTokens,
            maxInputTokens,
          })
        ) {
          logFromContext(ctx, "warn", "trpc.chat.turn.input_too_large", {
            user_id: user.id,
            agent_id: input.agentId,
            session_key: input.sessionKey,
            model: DEFAULT_CHAT_MODEL,
            input_tokens: incomingUserTokens,
            max_input_tokens: maxInputTokens,
            error_code: "INPUT_TOO_LARGE",
          });
          await appendAuditEvent(ctx, {
            agentId: input.agentId,
            eventType: "chat_input_too_large",
            payload: {
              userId: user.id,
              sessionKey: input.sessionKey,
              inputTokens: incomingUserTokens,
              maxInputTokens,
            },
          });
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "chat input exceeds max token limit",
          });
        }
        const degradePolicy = resolveChatBudgetDegradePolicy(process.env, configuredBudget);
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
            const summary = await ctx.container.ports.usage.sumUsage({
              agentId: input.agentId,
              from: window.from,
              to: window.to,
            });
            const usedTokens = (summary.tokensIn ?? 0) + (summary.tokensOut ?? 0);
            const projectedTokens = projectTotalTokens({
              usage: summary,
              incomingUserTokens,
              reserveOutputTokens: effectiveBudget.reserveOutputTokens,
            });
            if (
              wouldExceedTokenHardCap({
                cap,
                usage: summary,
                incomingUserTokens,
                reserveOutputTokens: effectiveBudget.reserveOutputTokens,
              })
            ) {
              if (!budgetDegraded && degradePolicy.enabled) {
                const degradedBudgetResult = buildDegradedBudget(configuredBudget, degradePolicy);
                if (degradedBudgetResult.degraded) {
                  const projectedWithDegradedBudget = projectTotalTokens({
                    usage: summary,
                    incomingUserTokens,
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
                    logFromContext(ctx, "warn", "trpc.chat.turn.budget_degraded", {
                      user_id: ctx.user?.id ?? null,
                      agent_id: input.agentId,
                      session_key: input.sessionKey,
                      model: DEFAULT_CHAT_MODEL,
                      period,
                      cap_tokens: cap,
                      used_tokens: usedTokens,
                      incoming_tokens: incomingUserTokens,
                      projected_tokens_before: projectedTokens,
                      projected_tokens_after: projectedWithDegradedBudget,
                      reserve_output_tokens_before: configuredBudget.reserveOutputTokens,
                      reserve_output_tokens_after: effectiveBudget.reserveOutputTokens,
                      memory_top_k_before: configuredBudget.memoryTopK,
                      memory_top_k_after: effectiveBudget.memoryTopK,
                      recent_messages_before: configuredBudget.recentMessages,
                      recent_messages_after: effectiveBudget.recentMessages,
                      error_code: "BUDGET_DEGRADED",
                    });
                    await appendAuditEvent(ctx, {
                      agentId: input.agentId,
                      eventType: "chat_budget_degraded",
                      payload: {
                        userId: user.id,
                        sessionKey: input.sessionKey,
                        period,
                        capTokens: cap,
                        usedTokens,
                        incomingTokens: incomingUserTokens,
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
              logFromContext(ctx, "warn", "trpc.chat.turn.hard_cap_exceeded", {
                user_id: ctx.user?.id ?? null,
                agent_id: input.agentId,
                session_key: input.sessionKey,
                model: DEFAULT_CHAT_MODEL,
                period,
                cap_tokens: cap,
                used_tokens: usedTokens,
                incoming_tokens: incomingUserTokens,
                reserve_output_tokens: effectiveBudget.reserveOutputTokens,
                projected_tokens: projectedTokens,
                budget_degraded: Boolean(budgetDegraded),
                error_code: "TOKEN_HARD_CAP_EXCEEDED",
              });
              await appendAuditEvent(ctx, {
                agentId: input.agentId,
                eventType: "chat_hard_cap_exceeded",
                payload: {
                  userId: user.id,
                  sessionKey: input.sessionKey,
                  period,
                  capTokens: cap,
                  usedTokens,
                  incomingTokens: incomingUserTokens,
                  reserveOutputTokens: effectiveBudget.reserveOutputTokens,
                  projectedTokens,
                  budgetDegraded: Boolean(budgetDegraded),
                },
              });
              throw new TRPCError({
                code: "TOO_MANY_REQUESTS",
                message: `${period} token hard cap exceeded`,
              });
            }
          }
        }

        const startedAt = Date.now();
        let result;
        try {
          result = await ctx.container.chat.chatTurn(
            input.agentId,
            input.sessionKey,
            input.userInput,
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
              idempotencyKey: input.idempotencyKey,
              model: DEFAULT_CHAT_MODEL,
              pricing: DEFAULT_CHAT_MODEL_PRICING,
              usageMeta: budgetDegraded
                ? {
                    model_route_strategy: routeStrategy,
                    model_route_primary: DEFAULT_CHAT_MODEL,
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
                    model_route_primary: DEFAULT_CHAT_MODEL,
                    model_route_fallback: fallbackModel ?? null,
                  },
              budget: effectiveBudget,
            },
          );
        } catch (error) {
          if (error instanceof IdempotencyConflictError) {
            logFromContext(ctx, "warn", "trpc.chat.turn.idempotency_conflict", {
              user_id: ctx.user?.id ?? null,
              agent_id: input.agentId,
              session_key: input.sessionKey,
              idempotency_key: input.idempotencyKey ?? null,
              model: DEFAULT_CHAT_MODEL,
              error_code: "CONFLICT",
              latency_ms: Date.now() - startedAt,
            });
            throw new TRPCError({
              code: "CONFLICT",
              message: error.message,
            });
          }
          logFromContext(ctx, "error", "trpc.chat.turn.failed", {
            user_id: ctx.user?.id ?? null,
            agent_id: input.agentId,
            session_key: input.sessionKey,
            idempotency_key: input.idempotencyKey ?? null,
            model: DEFAULT_CHAT_MODEL,
            error_code: "UPSTREAM_ERROR",
            latency_ms: Date.now() - startedAt,
          });
          throw error;
        }

        const latencyMs = Date.now() - startedAt;
        logFromContext(ctx, "info", "trpc.chat.turn.completed", {
          user_id: ctx.user?.id ?? null,
          agent_id: input.agentId,
          session_id: result.sessionId,
          session_key: input.sessionKey,
          idempotency_key: input.idempotencyKey ?? null,
          model: DEFAULT_CHAT_MODEL,
          budget_degraded: Boolean(budgetDegraded),
          tokens_in: approxTokens(input.userInput),
          tokens_out: approxTokens(result.assistantText),
          latency_ms: latencyMs,
        });
        if (latencyMs > CHAT_LATENCY_ALERT_MS) {
          logFromContext(ctx, "warn", "trpc.chat.turn.slow", {
            user_id: ctx.user?.id ?? null,
            agent_id: input.agentId,
            session_id: result.sessionId,
            session_key: input.sessionKey,
            idempotency_key: input.idempotencyKey ?? null,
            model: DEFAULT_CHAT_MODEL,
            latency_ms: latencyMs,
            threshold_ms: CHAT_LATENCY_ALERT_MS,
            error_code: "SLOW_REQUEST",
          });
        }

        return {
          sessionId: result.sessionId,
          assistantText: result.assistantText,
        };
      }),
  }),

  export: t.router({
    session: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          sessionId: z.string().min(1),
          format: z.enum(["markdown", "json"]).default("markdown"),
        }),
      )
      .query(async ({ ctx, input }) => {
        const _user = await ensureAgentAccess(ctx, input.agentId);
        const events = await ctx.container.ports.transcripts.listRecentEvents({
          agentId: input.agentId,
          sessionId: input.sessionId,
          limit: 500,
        });

        const messages = events
          .filter((e) => e.type === "user_message" || e.type === "assistant_message")
          .map((e) => ({
            role: e.type === "user_message" ? ("user" as const) : ("assistant" as const),
            content:
              typeof e.content?.text === "string" ? e.content.text : JSON.stringify(e.content),
            createdAt: e.createdAt,
          }));

        if (input.format === "json") {
          return { format: "json" as const, data: messages };
        }

        const md = messages
          .map((m) => `## ${m.role === "user" ? "用户" : "AI"}\n\n${m.content.trim()}`)
          .join("\n\n---\n\n");
        return { format: "markdown" as const, data: md };
      }),
  }),

  template: t.router({
    listTags: t.procedure.query(async ({ ctx }) => {
      requireUser(ctx);
      return withInfrastructureErrorMapping(async () => {
        const supabase = ctx.supabase;
        if (!supabase?.from) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Template store not available",
          });
        }
        const { data, error } = await supabase
          .from("template_tags")
          .select("id, name")
          .order("name");
        if (error) throw error;
        return (data ?? []) as Array<{ id: string; name: string }>;
      });
    }),

    list: t.procedure
      .input(
        z
          .object({
            onlyMine: z.boolean().default(false),
            limit: z.number().int().min(1).max(100).default(20),
            keyword: z.string().optional(),
            tagIds: z.array(z.string().uuid()).optional(),
          })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        const user = requireUser(ctx);
        const params = input ?? { onlyMine: false, limit: 20 };
        return withInfrastructureErrorMapping(async () => {
          const supabase = ctx.supabase;
          if (!supabase?.from) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Template store not available",
            });
          }
          let query = supabase
            .from("agent_templates")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(params.limit);

          const kw = params.keyword?.trim();
          if (kw) {
            const escapedKw = kw.replace(/%/g, "\\%").replace(/_/g, "\\_");
            const visOr = params.onlyMine
              ? `author_user_id.eq.${user.id}`
              : `is_public.eq.true,author_user_id.eq.${user.id}`;
            const kwOr = `name.ilike.%${escapedKw}%,description.ilike.%${escapedKw}%`;
            query = query.or(`and(or(${visOr}),or(${kwOr}))`);
          } else {
            if (params.onlyMine) {
              query = query.eq("author_user_id", user.id);
            } else {
              query = query.or(`is_public.eq.true,author_user_id.eq.${user.id}`);
            }
          }
          if (params.tagIds && params.tagIds.length > 0) {
            const { data: tagMatches } = await supabase
              .from("agent_template_tags")
              .select("template_id")
              .in("tag_id", params.tagIds);
            const templateIds = [
              ...new Set((tagMatches ?? []).map((r: { template_id: string }) => r.template_id)),
            ];
            if (templateIds.length === 0) return [];
            query = query.in("id", templateIds);
          }
          const { data, error } = await query;
          if (error) throw error;
          const items = (data ?? []) as Array<{
            id: string;
            author_user_id: string;
            name: string;
            description: string;
            config: Record<string, unknown>;
            is_public: boolean;
            clone_count: number;
            created_at: string;
            source_agent_id?: string | null;
          }>;
          items.forEach((t) => redactApiKeyInConfig(t.config));
          const ids = items.map((t) => t.id);
          const [tagRows, ratingRows] = await Promise.all([
            supabase
              .from("agent_template_tags")
              .select("template_id, template_tags(id, name)")
              .in("template_id", ids),
            supabase.from("template_ratings").select("template_id, rating").in("template_id", ids),
          ]);
          const tagMap = new Map<string, Array<{ id: string; name: string }>>();
          for (const r of (tagRows?.data ?? []) as Array<{
            template_id: string;
            template_tags?: { id: string; name: string } | null;
          }>) {
            if (r.template_tags) {
              const arr = tagMap.get(r.template_id) ?? [];
              arr.push({ id: r.template_tags.id, name: r.template_tags.name });
              tagMap.set(r.template_id, arr);
            }
          }
          const ratingMap = new Map<string, { sum: number; count: number }>();
          for (const r of (ratingRows?.data ?? []) as Array<{
            template_id: string;
            rating: number;
          }>) {
            const cur = ratingMap.get(r.template_id) ?? { sum: 0, count: 0 };
            cur.sum += r.rating;
            cur.count += 1;
            ratingMap.set(r.template_id, cur);
          }
          return items.map((t) => {
            const tags = tagMap.get(t.id) ?? [];
            const r = ratingMap.get(t.id);
            const ratingCount = r?.count ?? 0;
            const avgRating = ratingCount > 0 ? Math.round((r!.sum / ratingCount) * 10) / 10 : null;
            return { ...t, tags, avgRating, ratingCount };
          });
        });
      }),

    publish: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          description: z.string().default(""),
          isPublic: z.boolean().default(true),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const user = await ensureAgentAccess(ctx, input.agentId);
        return withInfrastructureErrorMapping(async () => {
          const agent = await ctx.container.agent.getAgent(input.agentId, user.id);
          const supabase = ctx.supabase;
          if (!supabase?.from) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Template store not available",
            });
          }
          const config = stripApiKeyFromConfig(
            (agent.config ?? {}) as unknown as Record<string, unknown>,
          );
          const now = new Date().toISOString();

          const { data: existing } = await supabase
            .from("agent_templates")
            .select("id, clone_count")
            .eq("author_user_id", user.id)
            .eq("source_agent_id", input.agentId)
            .maybeSingle();

          if (existing) {
            const { data, error } = await supabase
              .from("agent_templates")
              .update({
                name: agent.name,
                description: input.description,
                config,
                is_public: input.isPublic,
                updated_at: now,
              })
              .eq("id", existing.id)
              .select("*")
              .single();
            if (error) throw error;
            return { ...(data as object), created: false } as {
              id: string;
              name: string;
              description: string;
              config: Record<string, unknown>;
              is_public: boolean;
              created: boolean;
            };
          }

          const { data, error } = await supabase
            .from("agent_templates")
            .insert({
              author_user_id: user.id,
              source_agent_id: input.agentId,
              name: agent.name,
              description: input.description,
              config,
              is_public: input.isPublic,
              created_at: now,
              updated_at: now,
            })
            .select("*")
            .single();
          if (error) throw error;
          return { ...(data as object), created: true } as {
            id: string;
            name: string;
            description: string;
            config: Record<string, unknown>;
            is_public: boolean;
            created: boolean;
          };
        });
      }),

    clone: t.procedure
      .input(
        z.object({
          templateId: z.string().min(1),
          agentName: z.string().optional(),
          llmProviderOverrides: z
            .object({
              model: z.string(),
              baseURL: z.string(),
              apiKey: z.string(),
              presetId: z.string().optional(),
              sdkProvider: z
                .enum(["openai", "anthropic", "google", "deepseek", "xai", "mistral"])
                .optional(),
            })
            .optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const user = requireUser(ctx);
        return withInfrastructureErrorMapping(async () => {
          const supabase = ctx.supabase;
          if (!supabase?.from) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Template store not available",
            });
          }
          const { data: template, error: fetchError } = await supabase
            .from("agent_templates")
            .select("*")
            .eq("id", input.templateId)
            .single();
          if (fetchError || !template) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
          }
          if (!template.is_public && template.author_user_id !== user.id) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Template is private" });
          }

          let config = stripApiKeyFromConfig(template.config ?? {});
          if (input.llmProviderOverrides) {
            config = {
              ...config,
              llmProvider: input.llmProviderOverrides,
            };
          }
          const agentName =
            (input.agentName?.trim() || `${template.name} (copy)`).trim() ||
            `${template.name} (copy)`;

          const agent = await ctx.container.agent.createAgent(
            user.id,
            agentName,
            config as Partial<import("@daemon/domain").AgentConfig>,
          );

          await supabase
            .from("agent_templates")
            .update({ clone_count: (template.clone_count ?? 0) + 1 })
            .eq("id", input.templateId);

          return { agentId: agent.id, name: agent.name };
        });
      }),

    get: t.procedure
      .input(z.object({ templateId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        const user = requireUser(ctx);
        return withInfrastructureErrorMapping(async () => {
          const supabase = ctx.supabase;
          if (!supabase?.from) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Template store not available",
            });
          }
          const { data: template, error: fetchError } = await supabase
            .from("agent_templates")
            .select("*")
            .eq("id", input.templateId)
            .single();
          if (fetchError || !template) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
          }
          if (!template.is_public && template.author_user_id !== user.id) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Template is private" });
          }
          redactApiKeyInConfig(template.config);

          const { data: tagRows } = await supabase
            .from("agent_template_tags")
            .select("template_tags(id, name)")
            .eq("template_id", input.templateId);
          const tags = (
            (tagRows ?? []) as Array<{ template_tags?: { id: string; name: string } | null }>
          )
            .map((r) =>
              r.template_tags ? { id: r.template_tags.id, name: r.template_tags.name } : null,
            )
            .filter((t): t is { id: string; name: string } => t != null);

          const { data: ratingRows } = await supabase
            .from("template_ratings")
            .select("rating, user_id")
            .eq("template_id", input.templateId);
          const allRatings = (ratingRows ?? []) as Array<{ rating: number; user_id: string }>;
          const ratingCount = allRatings.length;
          const avgRating =
            ratingCount > 0 ? allRatings.reduce((s, r) => s + r.rating, 0) / ratingCount : null;
          const myRating = allRatings.find((r) => r.user_id === user.id)?.rating ?? null;

          return {
            ...template,
            tags,
            avgRating: avgRating != null ? Math.round(avgRating * 10) / 10 : null,
            ratingCount,
            myRating,
          };
        });
      }),

    update: t.procedure
      .input(
        z.object({
          templateId: z.string().min(1),
          name: z.string().min(1).max(200).optional(),
          description: z.string().optional(),
          config: z.record(z.unknown()).optional(),
          isPublic: z.boolean().optional(),
          tagIds: z.array(z.string().uuid()).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const user = requireUser(ctx);
        return withInfrastructureErrorMapping(async () => {
          const supabase = ctx.supabase;
          if (!supabase?.from) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Template store not available",
            });
          }
          const { data: existing, error: fetchError } = await supabase
            .from("agent_templates")
            .select("id, author_user_id")
            .eq("id", input.templateId)
            .single();
          if (fetchError || !existing) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
          }
          if (existing.author_user_id !== user.id) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Only the author can update this template",
            });
          }
          const now = new Date().toISOString();
          const updates: Record<string, unknown> = { updated_at: now };
          if (input.name !== undefined) updates.name = input.name;
          if (input.description !== undefined) updates.description = input.description;
          if (input.isPublic !== undefined) updates.is_public = input.isPublic;
          if (input.config !== undefined)
            updates.config = stripApiKeyFromConfig(input.config as Record<string, unknown>);

          const { data: updated, error: updateError } = await supabase
            .from("agent_templates")
            .update(updates)
            .eq("id", input.templateId)
            .select("*")
            .single();
          if (updateError) throw updateError;

          if (input.tagIds !== undefined) {
            await supabase.from("agent_template_tags").delete().eq("template_id", input.templateId);
            if (input.tagIds.length > 0) {
              await supabase
                .from("agent_template_tags")
                .insert(input.tagIds.map((tag_id) => ({ template_id: input.templateId, tag_id })));
            }
          }
          redactApiKeyInConfig(updated.config);
          return updated;
        });
      }),

    delete: t.procedure
      .input(z.object({ templateId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const user = requireUser(ctx);
        return withInfrastructureErrorMapping(async () => {
          const supabase = ctx.supabase;
          if (!supabase?.from) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Template store not available",
            });
          }
          const { data: existing, error: fetchError } = await supabase
            .from("agent_templates")
            .select("id, author_user_id")
            .eq("id", input.templateId)
            .single();
          if (fetchError || !existing) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
          }
          if (existing.author_user_id !== user.id) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Only the author can delete this template",
            });
          }
          const { error: deleteError } = await supabase
            .from("agent_templates")
            .delete()
            .eq("id", input.templateId);
          if (deleteError) throw deleteError;
          return { deleted: true };
        });
      }),

    rate: t.procedure
      .input(z.object({ templateId: z.string().min(1), rating: z.number().int().min(1).max(5) }))
      .mutation(async ({ ctx, input }) => {
        const user = requireUser(ctx);
        return withInfrastructureErrorMapping(async () => {
          const supabase = ctx.supabase;
          if (!supabase?.from) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Template store not available",
            });
          }
          const { data: t, error: fetchError } = await supabase
            .from("agent_templates")
            .select("id, is_public, author_user_id")
            .eq("id", input.templateId)
            .single();
          if (fetchError || !t) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
          }
          if (!t.is_public && t.author_user_id !== user.id) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Template is private" });
          }
          const { error: upsertError } = await supabase
            .from("template_ratings")
            .upsert(
              { template_id: input.templateId, user_id: user.id, rating: input.rating },
              { onConflict: "template_id,user_id" },
            );
          if (upsertError) throw upsertError;
          return { rating: input.rating };
        });
      }),
  }),

  workspace: t.router({
    create: t.procedure
      .input(
        z.object({
          name: z.string().min(1).max(100),
          slug: z
            .string()
            .min(2)
            .max(50)
            .regex(/^[a-z0-9-]+$/),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const user = requireUser(ctx);
        return withInfrastructureErrorMapping(async () => {
          const supabase = ctx.supabase;
          if (!supabase?.from) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Store unavailable" });
          }
          const now = new Date().toISOString();
          const { data, error } = await supabase
            .from("workspaces")
            .insert({
              name: input.name,
              slug: input.slug,
              owner_user_id: user.id,
              created_at: now,
              updated_at: now,
            })
            .select("*")
            .single();
          if (error) throw error;

          await supabase.from("workspace_members").insert({
            workspace_id: data.id,
            user_id: user.id,
            role: "owner",
            invited_by: null,
            created_at: now,
          });

          return data as {
            id: string;
            name: string;
            slug: string;
            owner_user_id: string;
            created_at: string;
          };
        });
      }),

    list: t.procedure.query(async ({ ctx }) => {
      const user = requireUser(ctx);
      return withInfrastructureErrorMapping(async () => {
        const supabase = ctx.supabase;
        if (!supabase?.from) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Store unavailable" });
        }
        const { data: memberships, error: memErr } = await supabase
          .from("workspace_members")
          .select("workspace_id, role")
          .eq("user_id", user.id);
        if (memErr) throw memErr;
        if (!memberships || memberships.length === 0) return [];

        const ids = memberships.map((m: { workspace_id: string }) => m.workspace_id);
        const roleMap = Object.fromEntries(
          memberships.map((m: { workspace_id: string; role: string }) => [m.workspace_id, m.role]),
        );

        const { data: workspaces, error: wsErr } = await supabase
          .from("workspaces")
          .select("*")
          .in("id", ids)
          .order("created_at", { ascending: false });
        if (wsErr) throw wsErr;
        interface WorkspaceRow {
          id: string;
          name: string;
          slug: string;
          owner_user_id: string;
          created_at: string;
        }
        return ((workspaces ?? []) as WorkspaceRow[]).map((ws) => ({
          id: ws.id,
          name: ws.name,
          slug: ws.slug,
          ownerUserId: ws.owner_user_id,
          role: roleMap[ws.id] ?? "member",
          createdAt: ws.created_at,
        }));
      });
    }),

    members: t.procedure
      .input(z.object({ workspaceId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        const user = requireUser(ctx);
        return withInfrastructureErrorMapping(async () => {
          const supabase = ctx.supabase;
          if (!supabase?.from) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Store unavailable" });
          }
          const { data: membership } = await supabase
            .from("workspace_members")
            .select("role")
            .eq("workspace_id", input.workspaceId)
            .eq("user_id", user.id)
            .single();
          if (!membership) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Not a workspace member" });
          }
          const { data, error } = await supabase
            .from("workspace_members")
            .select("id, user_id, role, created_at")
            .eq("workspace_id", input.workspaceId)
            .order("created_at", { ascending: true });
          if (error) throw error;
          return (data ?? []) as Array<{
            id: string;
            user_id: string;
            role: string;
            created_at: string;
          }>;
        });
      }),

    invite: t.procedure
      .input(
        z.object({
          workspaceId: z.string().min(1),
          userId: z.string().min(1),
          role: z.enum(["admin", "member", "viewer"]).default("member"),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const user = requireUser(ctx);
        return withInfrastructureErrorMapping(async () => {
          const supabase = ctx.supabase;
          if (!supabase?.from) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Store unavailable" });
          }
          const { data: membership } = await supabase
            .from("workspace_members")
            .select("role")
            .eq("workspace_id", input.workspaceId)
            .eq("user_id", user.id)
            .single();
          if (!membership || !["owner", "admin"].includes(membership.role)) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Only owners and admins can invite members",
            });
          }
          const now = new Date().toISOString();
          const { data, error } = await supabase
            .from("workspace_members")
            .insert({
              workspace_id: input.workspaceId,
              user_id: input.userId,
              role: input.role,
              invited_by: user.id,
              created_at: now,
            })
            .select("id, user_id, role, created_at")
            .single();
          if (error) throw error;
          return data as { id: string; user_id: string; role: string; created_at: string };
        });
      }),

    removeMember: t.procedure
      .input(
        z.object({
          workspaceId: z.string().min(1),
          memberId: z.string().min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const user = requireUser(ctx);
        return withInfrastructureErrorMapping(async () => {
          const supabase = ctx.supabase;
          if (!supabase?.from) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Store unavailable" });
          }
          const { data: callerMembership } = await supabase
            .from("workspace_members")
            .select("role")
            .eq("workspace_id", input.workspaceId)
            .eq("user_id", user.id)
            .single();
          if (!callerMembership || !["owner", "admin"].includes(callerMembership.role)) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Only owners and admins can remove members",
            });
          }
          const { data: target } = await supabase
            .from("workspace_members")
            .select("id, role, user_id")
            .eq("id", input.memberId)
            .eq("workspace_id", input.workspaceId)
            .single();
          if (!target) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
          }
          if (target.role === "owner") {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Cannot remove workspace owner",
            });
          }
          const { error } = await supabase
            .from("workspace_members")
            .delete()
            .eq("id", input.memberId);
          if (error) throw error;
          return { removed: true };
        });
      }),

    delete: t.procedure
      .input(z.object({ workspaceId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const user = requireUser(ctx);
        return withInfrastructureErrorMapping(async () => {
          const supabase = ctx.supabase;
          if (!supabase?.from) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Store unavailable" });
          }
          const { data: membership } = await supabase
            .from("workspace_members")
            .select("role")
            .eq("workspace_id", input.workspaceId)
            .eq("user_id", user.id)
            .single();
          if (!membership || membership.role !== "owner") {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Only the workspace owner can delete the workspace",
            });
          }
          // Remove all members first, then the workspace row
          await supabase.from("workspace_members").delete().eq("workspace_id", input.workspaceId);
          const { error } = await supabase.from("workspaces").delete().eq("id", input.workspaceId);
          if (error) throw error;
          return { deleted: true };
        });
      }),
  }),
});

export type AppRouter = typeof appRouter;
