import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { ApiContext } from "./context";

const t = initTRPC.context<ApiContext>().create();

const requireUser = (ctx: ApiContext) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return ctx.user;
};

const DEFAULT_BUDGET = {
  modelWindow: Number(process.env.MODEL_CONTEXT_WINDOW ?? 128000),
  reserveOutputTokens: Number(process.env.RESERVE_OUTPUT_TOKENS ?? 2048),
  reserveToolTokens: Number(process.env.RESERVE_TOOL_TOKENS ?? 512),
  memoryTopK: Number(process.env.MEMORY_TOPK ?? 8),
  recentMessages: Number(process.env.RECENT_MESSAGES ?? 20),
};

export const appRouter = t.router({
  agent: t.router({
    create: t.procedure
      .input(z.object({ name: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const user = requireUser(ctx);
        return ctx.container.agent.createAgent(user.id, input.name);
      }),
    list: t.procedure.query(async ({ ctx }) => {
      const user = requireUser(ctx);
      return ctx.container.agent.listAgents(user.id);
    }),
    get: t.procedure
      .input(z.object({ agentId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        const user = requireUser(ctx);
        return ctx.container.agent.getAgent(input.agentId, user.id);
      }),
  }),

  transcript: t.router({
    list: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          sessionId: z.string().min(1),
          limit: z.number().int().min(1).max(200).default(50),
        })
      )
      .query(async ({ ctx, input }) => {
        requireUser(ctx);
        return ctx.container.transcript.loadRecentContext(
          input.agentId,
          input.sessionId,
          input.limit
        );
      }),
  }),

  memory: t.router({
    list: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          limit: z.number().int().min(1).max(200).default(50),
        })
      )
      .query(async ({ ctx, input }) => {
        requireUser(ctx);
        return ctx.container.memory.listMemoryItems(input.agentId, input.limit);
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
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireUser(ctx);
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
  }),

  usage: t.router({
    summary: t.procedure
      .input(
        z.object({
          agentId: z.string().min(1),
          period: z.enum(["day", "month"]).default("day"),
        })
      )
      .query(async ({ ctx, input }) => {
        requireUser(ctx);
        const now = new Date();
        const from = new Date(now);
        if (input.period === "day") {
          from.setHours(0, 0, 0, 0);
        } else {
          from.setDate(1);
          from.setHours(0, 0, 0, 0);
        }
        return ctx.container.ports.usage.sumUsage({
          agentId: input.agentId,
          from: from.toISOString(),
          to: now.toISOString(),
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
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireUser(ctx);
        const result = await ctx.container.chat.chatTurn(
          input.agentId,
          input.sessionKey,
          input.userInput,
          {
            system: input.system || "You are a helpful AI assistant.",
            constraints: [],
            taskState: null,
            memoryTopK: DEFAULT_BUDGET.memoryTopK,
            recentMessages: DEFAULT_BUDGET.recentMessages,
            budget: DEFAULT_BUDGET,
          }
        );

        return {
          sessionId: result.sessionId,
          assistantText: result.assistantText,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
