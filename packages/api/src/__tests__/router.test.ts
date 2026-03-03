import { beforeEach, describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { DEFAULT_AGENT_CONFIG, ForbiddenError, IdempotencyConflictError, type Services } from "@daemon/domain";
import type { ApiContext } from "../context";
import { appRouter } from "../router";
import { chatRateLimiter } from "../rateLimit";

const buildContainer = (overrides?: {
  usageSum?: (input: { agentId: string; from: string; to: string }) => Promise<{
    tokensIn: number;
    tokensOut: number;
    costEstimate: number;
  }>;
  usageSeries?: (input: {
    agentId: string;
    from: string;
    to: string;
    bucket: "hour" | "day";
  }) => Promise<
    Array<{
      bucketStart: string;
      tokensIn: number;
      tokensOut: number;
      costEstimate: number;
    }>
  >;
  chatTurn?: Services["chat"]["chatTurn"];
  createAgent?: Services["agent"]["createAgent"];
  listAgents?: Services["agent"]["listAgents"];
  getAgent?: Services["agent"]["getAgent"];
  deleteAgent?: Services["agent"]["deleteAgent"];
  writeMemoryItem?: Services["memory"]["writeMemoryItem"];
  updateMemoryItem?: Services["memory"]["updateMemoryItem"];
  deleteMemoryItem?: Services["memory"]["deleteMemoryItem"];
  listSessions?: Services["session"]["listRecentSessions"];
  deleteSession?: Services["session"]["deleteSession"];
  renameSession?: Services["session"]["renameSession"];
  rateLimitConsume?: NonNullable<Services["ports"]["rateLimit"]>["consumeLimit"];
}): Services =>
  ({
    ports: {
      usage: {
        sumUsage:
          overrides?.usageSum ??
          (async () => ({ tokensIn: 0, tokensOut: 0, costEstimate: 0 })),
        seriesUsage:
          overrides?.usageSeries ??
          (async () => []),
      },
      rateLimit: overrides?.rateLimitConsume
        ? {
            consumeLimit: overrides.rateLimitConsume,
          }
        : undefined,
    },
    agent: {
      createAgent:
        overrides?.createAgent ??
        (async (ownerUserId, name) => ({
          id: "agent-1",
          ownerUserId,
          name,
          config: { ...DEFAULT_AGENT_CONFIG },
          createdAt: "2026-02-03T00:00:00.000Z",
          updatedAt: "2026-02-03T00:00:00.000Z",
        })),
      listAgents: overrides?.listAgents ?? (async () => []),
      getAgent:
        overrides?.getAgent ??
        (async (agentId, ownerUserId) => ({
          id: agentId,
          ownerUserId,
          name: "Agent",
          config: { ...DEFAULT_AGENT_CONFIG },
          createdAt: "2026-02-03T00:00:00.000Z",
          updatedAt: "2026-02-03T00:00:00.000Z",
        })),
      deleteAgent: overrides?.deleteAgent ?? (async () => {}),
    },
    chat: {
      chatTurn:
        overrides?.chatTurn ??
        (async () => ({
          sessionId: "session-1",
          assistantText: "ok",
        })),
    },
    memory: {
      writeMemoryItem:
        overrides?.writeMemoryItem ??
        (async (agentId, input) => ({
          id: "memory-1",
          agentId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          type: input.type,
          content: input.content,
          tags: input.tags,
          sensitivity: input.sensitivity,
          contextEligible: input.contextEligible,
          embedding: [1, 0, 0],
          createdAt: "2026-02-03T00:00:00.000Z",
          updatedAt: "2026-02-03T00:00:00.000Z",
        })),
      updateMemoryItem:
        overrides?.updateMemoryItem ??
        (async (agentId, memoryId, input) => ({
          id: memoryId,
          agentId,
          scopeType: "user",
          scopeId: "user-1",
          type: "fact",
          content: input.content ?? "updated",
          tags: input.tags ?? [],
          sensitivity: input.sensitivity ?? "public",
          contextEligible: input.contextEligible ?? true,
          embedding: [1, 0, 0],
          createdAt: "2026-02-03T00:00:00.000Z",
          updatedAt: "2026-02-03T00:00:00.000Z",
        })),
      deleteMemoryItem: overrides?.deleteMemoryItem ?? (async () => {}),
    },
    session: {
      listRecentSessions:
        overrides?.listSessions ??
        (async () => []),
      deleteSession: overrides?.deleteSession ?? (async () => {}),
      renameSession: overrides?.renameSession ?? (async () => {}),
    },
  }) as unknown as Services;

const buildContext = (input?: {
  user?: ApiContext["user"];
  container?: Services;
}): ApiContext => ({
  user: input && "user" in input ? (input.user ?? null) : { id: "user-1" },
  container: input?.container ?? buildContainer(),
});

const requireUsageInput = (
  value: { agentId: string; from: string; to: string } | null
): { agentId: string; from: string; to: string } => {
  if (!value) {
    throw new Error("Expected usage input to be captured");
  }
  return value;
};

const withEnv = async (
  next: Partial<Record<string, string | undefined>>,
  run: () => Promise<void>
) => {
  const prev: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(next)) {
    prev[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

describe("api router", () => {
  beforeEach(() => {
    chatRateLimiter.reset();
  });

  test("agent.list rejects unauthorized request", async () => {
    const caller = appRouter.createCaller(
      buildContext({
        user: null,
      })
    );

    await expect(caller.agent.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("agent.list maps missing schema errors to actionable message", async () => {
    const caller = appRouter.createCaller(
      buildContext({
        container: buildContainer({
          listAgents: async () => {
            throw {
              code: "42P01",
              message: 'relation "public.agents" does not exist',
            };
          },
        }),
      })
    );

    await expect(caller.agent.list()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Supabase schema is not ready. Apply schema.sql and rls.sql before using agents.",
    });
  });

  test("agent.create maps permission errors to forbidden guidance", async () => {
    const caller = appRouter.createCaller(
      buildContext({
        container: buildContainer({
          createAgent: async () => {
            throw {
              code: "42501",
              message: "permission denied for table agents",
            };
          },
        }),
      })
    );

    await expect(caller.agent.create({ name: "Alpha" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Supabase denied access to agents. Verify RLS policies in rls.sql and your login session.",
    });
  });

  test("usage.summary computes day period range", async () => {
    let capturedInput: { agentId: string; from: string; to: string } | null = null;
    const caller = appRouter.createCaller(
      buildContext({
        container: buildContainer({
          usageSum: async (input) => {
            capturedInput = input;
            return { tokensIn: 12, tokensOut: 34, costEstimate: 0.005 };
          },
        }),
      })
    );

    const result = await caller.usage.summary({
      agentId: "agent-1",
      period: "day",
    });

    expect(result).toEqual({
      tokensIn: 12,
      tokensOut: 34,
      costEstimate: 0.005,
    });
    const usageInput = requireUsageInput(capturedInput);
    expect(usageInput.agentId).toBe("agent-1");

    const to = new Date(usageInput.to);
    const expectedFrom = new Date(to);
    expectedFrom.setHours(0, 0, 0, 0);
    expect(usageInput.from).toBe(expectedFrom.toISOString());
  });

  test("usage.summary rejects when agent access is forbidden", async () => {
    let usageCalled = false;
    const caller = appRouter.createCaller(
      buildContext({
        container: buildContainer({
          getAgent: async () => {
            throw new ForbiddenError("Agent access denied");
          },
          usageSum: async () => {
            usageCalled = true;
            return { tokensIn: 1, tokensOut: 2, costEstimate: 0.001 };
          },
        }),
      })
    );

    await expect(
      caller.usage.summary({
        agentId: "agent-2",
        period: "day",
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(usageCalled).toBe(false);
  });

  test("usage.summary computes month period range", async () => {
    let capturedInput: { agentId: string; from: string; to: string } | null = null;
    const caller = appRouter.createCaller(
      buildContext({
        container: buildContainer({
          usageSum: async (input) => {
            capturedInput = input;
            return { tokensIn: 1, tokensOut: 2, costEstimate: 0.003 };
          },
        }),
      })
    );

    const result = await caller.usage.summary({
      agentId: "agent-1",
      period: "month",
    });

    expect(result).toEqual({
      tokensIn: 1,
      tokensOut: 2,
      costEstimate: 0.003,
    });
    const usageInput = requireUsageInput(capturedInput);
    const to = new Date(usageInput.to);
    const expectedFrom = new Date(to);
    expectedFrom.setDate(1);
    expectedFrom.setHours(0, 0, 0, 0);
    expect(usageInput.from).toBe(expectedFrom.toISOString());
  });

  test("usage.trend maps day period to hourly buckets", async () => {
    const capturedInputs: Array<{
      agentId: string;
      from: string;
      to: string;
      bucket: "hour" | "day";
    }> = [];

    const caller = appRouter.createCaller(
      buildContext({
        container: buildContainer({
          usageSeries: async (input) => {
            capturedInputs.push(input);
            return [
              {
                bucketStart: "2026-02-03T10:00:00.000Z",
                tokensIn: 2,
                tokensOut: 3,
                costEstimate: 0.001,
              },
            ];
          },
        }),
      })
    );

    const result = await caller.usage.trend({
      agentId: "agent-1",
      period: "day",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.tokensIn).toBe(2);
    if (!capturedInputs[0]) {
      throw new Error("Expected usage trend input to be captured");
    }
    expect(capturedInputs[0].bucket).toBe("hour");
  });

  test("usage.trend maps month period to daily buckets", async () => {
    const capturedInputs: Array<{
      agentId: string;
      from: string;
      to: string;
      bucket: "hour" | "day";
    }> = [];

    const caller = appRouter.createCaller(
      buildContext({
        container: buildContainer({
          usageSeries: async (input) => {
            capturedInputs.push(input);
            return [];
          },
        }),
      })
    );

    await caller.usage.trend({
      agentId: "agent-1",
      period: "month",
    });

    if (!capturedInputs[0]) {
      throw new Error("Expected usage trend input to be captured");
    }
    expect(capturedInputs[0].bucket).toBe("day");
  });

  test("session.list returns recent sessions for current agent", async () => {
    const capturedCalls: Array<{ agentId: string; limit: number | undefined }> = [];
    const caller = appRouter.createCaller(
      buildContext({
        container: buildContainer({
          listSessions: async (agentId, limit) => {
            capturedCalls.push({ agentId, limit });
            return [
              {
                id: "session-1",
                agentId,
                sessionKey: "main",
                displayName: null,
                isArchived: false,
                createdAt: "2026-02-03T00:00:00.000Z",
                lastActiveAt: "2026-02-03T10:00:00.000Z",
              },
            ];
          },
        }),
      })
    );

    const result = await caller.session.list({
      agentId: "agent-1",
      limit: 10,
    });

    expect(capturedCalls[0]?.agentId).toBe("agent-1");
    expect(capturedCalls[0]?.limit).toBe(10);
    expect(result).toHaveLength(1);
    expect(result[0]?.sessionKey).toBe("main");
  });

  test("agent.delete deletes owned agent", async () => {
    let captured: any = null;
    const caller = appRouter.createCaller(
      buildContext({
        container: buildContainer({
          deleteAgent: async (agentId, userId) => {
            captured = { agentId, userId };
          },
        }),
      })
    );

    await caller.agent.delete({ agentId: "agent-1" });
    if (!captured) {
      throw new Error("Expected deleteAgent input to be captured");
    }
    expect(captured.agentId).toBe("agent-1");
    expect(captured.userId).toBe("user-1");
  });

  test("session.delete deletes session through agent ownership", async () => {
    let captured: any = null;
    const caller = appRouter.createCaller(
      buildContext({
        container: buildContainer({
          deleteSession: async (agentId, sessionId, userId) => {
            captured = { agentId, sessionId, userId };
          },
        }),
      })
    );

    await caller.session.delete({ agentId: "agent-1", sessionId: "session-1" });
    if (!captured) {
      throw new Error("Expected deleteSession input to be captured");
    }
    expect(captured.agentId).toBe("agent-1");
    expect(captured.sessionId).toBe("session-1");
    expect(captured.userId).toBe("user-1");
  });

  test("session.rename renames session through agent ownership", async () => {
    let captured: any = null;
    const caller = appRouter.createCaller(
      buildContext({
        container: buildContainer({
          renameSession: async (agentId, sessionId, displayName, userId) => {
            captured = { agentId, sessionId, displayName, userId };
          },
        }),
      })
    );

    await caller.session.rename({
      agentId: "agent-1",
      sessionId: "session-1",
      displayName: "我的会话",
    });
    if (!captured) {
      throw new Error("Expected renameSession input to be captured");
    }
    expect(captured.agentId).toBe("agent-1");
    expect(captured.sessionId).toBe("session-1");
    expect(captured.displayName).toBe("我的会话");
    expect(captured.userId).toBe("user-1");
  });

  test("chat.turn maps idempotency conflict to TRPC CONFLICT", async () => {
    const caller = appRouter.createCaller(
      buildContext({
        container: buildContainer({
          chatTurn: async () => {
            throw new IdempotencyConflictError("duplicate request");
          },
        }),
      })
    );

    let thrown: unknown;
    try {
      await caller.chat.turn({
        agentId: "agent-1",
        sessionKey: "main",
        userInput: "hello",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TRPCError);
    expect((thrown as TRPCError).code).toBe("CONFLICT");
    expect((thrown as TRPCError).message).toContain("duplicate request");
  });

  test("chat.turn rejects when agent access is forbidden", async () => {
    let chatCalled = false;
    const caller = appRouter.createCaller(
      buildContext({
        container: buildContainer({
          getAgent: async () => {
            throw new ForbiddenError("Agent access denied");
          },
          chatTurn: async () => {
            chatCalled = true;
            return {
              sessionId: "session-1",
              assistantText: "ok",
              context: {
                system: "",
                constraints: [],
                taskState: null,
                memoryTopK: [],
                recentMessages: [],
                userInput: "hello",
                messages: [],
                maxContextTokens: 0,
                tokenEstimate: 0,
                trimmed: { memory: false, recent: false },
                shouldCompact: false,
              },
            };
          },
        }),
      })
    );

    await expect(
      caller.chat.turn({
        agentId: "agent-2",
        sessionKey: "main",
        userInput: "hello",
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(chatCalled).toBe(false);
  });

  test("chat.turn enforces configured daily token hard cap", async () => {
    await withEnv(
      {
        CHAT_DAILY_TOKEN_HARD_CAP: "1000",
        CHAT_MONTHLY_TOKEN_HARD_CAP: undefined,
      },
      async () => {
        let chatCalled = false;
        const caller = appRouter.createCaller(
          buildContext({
            container: buildContainer({
              usageSum: async () => ({
                tokensIn: 700,
                tokensOut: 250,
                costEstimate: 0.01,
              }),
              chatTurn: async () => {
                chatCalled = true;
                return {
                  sessionId: "session-1",
                  assistantText: "ok",
                  context: {
                    system: "",
                    constraints: [],
                    taskState: null,
                    memoryTopK: [],
                    recentMessages: [],
                    userInput: "hello",
                    messages: [],
                    maxContextTokens: 0,
                    tokenEstimate: 0,
                    trimmed: { memory: false, recent: false },
                    shouldCompact: false,
                  },
                };
              },
            }),
          })
        );

        await expect(
          caller.chat.turn({
            agentId: "agent-1",
            sessionKey: "main",
            userInput: "hello",
          })
        ).rejects.toMatchObject({
          code: "TOO_MANY_REQUESTS",
        });
        expect(chatCalled).toBe(false);
      }
    );
  });

  test("chat.turn rejects inputs that exceed CHAT_MAX_INPUT_TOKENS", async () => {
    await withEnv(
      {
        CHAT_MAX_INPUT_TOKENS: "2",
      },
      async () => {
        let chatCalled = false;
        const caller = appRouter.createCaller(
          buildContext({
            container: buildContainer({
              chatTurn: async () => {
                chatCalled = true;
                return {
                  sessionId: "session-1",
                  assistantText: "ok",
                  context: {
                    system: "",
                    constraints: [],
                    taskState: null,
                    memoryTopK: [],
                    recentMessages: [],
                    userInput: "hello",
                    messages: [],
                    maxContextTokens: 0,
                    tokenEstimate: 0,
                    trimmed: { memory: false, recent: false },
                    shouldCompact: false,
                  },
                };
              },
            }),
          })
        );

        await expect(
          caller.chat.turn({
            agentId: "agent-1",
            sessionKey: "main",
            userInput: "hello world",
          })
        ).rejects.toMatchObject({
          code: "BAD_REQUEST",
          message: "chat input exceeds max token limit",
        });
        expect(chatCalled).toBe(false);
      }
    );
  });

  test("chat.turn degrades budget when hard cap can be satisfied after downgrade", async () => {
    await withEnv(
      {
        CHAT_DAILY_TOKEN_HARD_CAP: "1000",
        CHAT_MONTHLY_TOKEN_HARD_CAP: undefined,
        CHAT_BUDGET_DEGRADE_ENABLED: "1",
        CHAT_DEGRADE_RESERVE_OUTPUT_TOKENS: "64",
        CHAT_DEGRADE_MEMORY_TOPK: "2",
        CHAT_DEGRADE_RECENT_MESSAGES: "4",
        OPENAI_FALLBACK_MODEL: "fallback-model",
      },
      async () => {
        let capturedOptions: Record<string, unknown> | null = null;

        const caller = appRouter.createCaller(
          buildContext({
            container: buildContainer({
              usageSum: async () => ({
                tokensIn: 900,
                tokensOut: 0,
                costEstimate: 0.01,
              }),
              chatTurn: async (_agentId, _sessionKey, _userInput, options) => {
                capturedOptions = options as unknown as Record<string, unknown>;
                return {
                  sessionId: "session-1",
                  assistantText: "ok",
                  context: {
                    system: "",
                    constraints: [],
                    taskState: null,
                    memoryTopK: [],
                    recentMessages: [],
                    userInput: "hello",
                    messages: [],
                    maxContextTokens: 0,
                    tokenEstimate: 0,
                    trimmed: { memory: false, recent: false },
                    shouldCompact: false,
                  },
                };
              },
            }),
          })
        );

        const result = await caller.chat.turn({
          agentId: "agent-1",
          sessionKey: "main",
          userInput: "hello world",
        });

        expect(result.sessionId).toBe("session-1");
        if (!capturedOptions) {
          throw new Error("Expected chat options to be captured");
        }
        expect(capturedOptions["budget"]).toMatchObject({
          reserveOutputTokens: 64,
          memoryTopK: 2,
          recentMessages: 4,
        });
        expect(capturedOptions["usageMeta"]).toMatchObject({
          model_route_strategy: "primary_then_fallback",
          model_route_primary: "gpt-4o-mini",
          model_route_fallback: "fallback-model",
          budget_degraded: true,
          reserve_output_tokens_after: 64,
          memory_top_k_after: 2,
          recent_messages_after: 4,
        });
      }
    );
  });

  test("chat.turn enforces configured qps limit", async () => {
    await withEnv(
      {
        CHAT_QPS_LIMIT: "1",
        CHAT_QPM_LIMIT: undefined,
        CHAT_DAILY_TOKEN_HARD_CAP: undefined,
        CHAT_MONTHLY_TOKEN_HARD_CAP: undefined,
      },
      async () => {
        const caller = appRouter.createCaller(buildContext());

        const first = await caller.chat.turn({
          agentId: "agent-1",
          sessionKey: "main",
          userInput: "first",
        });
        expect(first.sessionId).toBe("session-1");

        await expect(
          caller.chat.turn({
            agentId: "agent-1",
            sessionKey: "main",
            userInput: "second",
          })
        ).rejects.toMatchObject({
          code: "TOO_MANY_REQUESTS",
        });
      }
    );
  });

  test("chat.turn uses db-backed rateLimit store when available", async () => {
    await withEnv(
      {
        CHAT_QPS_LIMIT: "1",
        CHAT_QPM_LIMIT: undefined,
      },
      async () => {
        let chatCalled = false;
        const caller = appRouter.createCaller(
          buildContext({
            container: buildContainer({
              rateLimitConsume: async () => ({
                allowed: false,
                retryAfterMs: 500,
              }),
              chatTurn: async () => {
                chatCalled = true;
                return {
                  sessionId: "session-1",
                  assistantText: "ok",
                  context: {
                    system: "",
                    constraints: [],
                    taskState: null,
                    memoryTopK: [],
                    recentMessages: [],
                    userInput: "hello",
                    messages: [],
                    maxContextTokens: 0,
                    tokenEstimate: 0,
                    trimmed: { memory: false, recent: false },
                    shouldCompact: false,
                  },
                };
              },
            }),
          })
        );

        await expect(
          caller.chat.turn({
            agentId: "agent-1",
            sessionKey: "main",
            userInput: "hello",
          })
        ).rejects.toMatchObject({
          code: "TOO_MANY_REQUESTS",
        });
        expect(chatCalled).toBe(false);
      }
    );
  });

  test("memory.create rejects scope mismatch for current user", async () => {
    const caller = appRouter.createCaller(buildContext());

    await expect(
      caller.memory.create({
        agentId: "agent-1",
        scopeType: "user",
        scopeId: "other-user",
        type: "fact",
        content: "prefers tea",
        tags: [],
        sensitivity: "public",
        contextEligible: true,
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("memory.create accepts current user scope and persists item", async () => {
    let capturedScopeId = "";
    const caller = appRouter.createCaller(
      buildContext({
        user: { id: "user-1" },
        container: buildContainer({
          writeMemoryItem: async (agentId, input) => {
            capturedScopeId = input.scopeId;
            return {
              id: "memory-1",
              agentId,
              scopeType: input.scopeType,
              scopeId: input.scopeId,
              type: input.type,
              content: input.content,
              tags: input.tags,
              sensitivity: input.sensitivity,
              contextEligible: input.contextEligible,
              embedding: [1, 0, 0],
              createdAt: "2026-02-03T00:00:00.000Z",
              updatedAt: "2026-02-03T00:00:00.000Z",
            };
          },
        }),
      })
    );

    const item = await caller.memory.create({
      agentId: "agent-1",
      scopeType: "user",
      scopeId: "user-1",
      type: "fact",
      content: "prefers tea",
      tags: [],
      sensitivity: "public",
      contextEligible: true,
    });

    expect(item.scopeId).toBe("user-1");
    expect(capturedScopeId).toBe("user-1");
  });

  test("memory.update forwards updates for owned agent", async () => {
    let captured: any = null;
    const caller = appRouter.createCaller(
      buildContext({
        container: buildContainer({
          updateMemoryItem: async (agentId, memoryId, input) => {
            captured = { agentId, memoryId, input };
            return {
              id: memoryId,
              agentId,
              scopeType: "user",
              scopeId: "user-1",
              type: "fact",
              content: input.content ?? "updated",
              tags: input.tags ?? [],
              sensitivity: input.sensitivity ?? "public",
              contextEligible: input.contextEligible ?? true,
              embedding: [1, 0, 0],
              createdAt: "2026-02-03T00:00:00.000Z",
              updatedAt: "2026-02-03T00:00:00.000Z",
            };
          },
        }),
      })
    );

    await caller.memory.update({
      agentId: "agent-1",
      memoryId: "memory-1",
      content: "新的内容",
      tags: ["偏好"],
      sensitivity: "private",
      contextEligible: false,
    });

    expect(captured).toBeTruthy();
    expect(captured.agentId).toBe("agent-1");
    expect(captured.memoryId).toBe("memory-1");
    expect(captured.input).toMatchObject({
      content: "新的内容",
      tags: ["偏好"],
      sensitivity: "private",
      contextEligible: false,
    });
  });

  test("memory.delete forwards delete call for owned agent", async () => {
    let captured: any = null;
    const caller = appRouter.createCaller(
      buildContext({
        container: buildContainer({
          deleteMemoryItem: async (agentId, memoryId) => {
            captured = { agentId, memoryId };
          },
        }),
      })
    );

    await caller.memory.delete({
      agentId: "agent-1",
      memoryId: "memory-1",
    });

    expect(captured).toBeTruthy();
    expect(captured.agentId).toBe("agent-1");
    expect(captured.memoryId).toBe("memory-1");
  });
});
