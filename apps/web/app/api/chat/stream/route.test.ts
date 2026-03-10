/// <reference types="bun-types" />
import { beforeEach, describe, expect, test } from "bun:test";
import { chatRateLimiter } from "@daemon/api";
import { ForbiddenError, IdempotencyConflictError } from "@daemon/domain";
import { createPostHandler as originalCreatePostHandler } from "./route";

const createPostHandler = (opts: any) => {
  let createdContainer: any = null;
  const originalCreateContainer = opts.createContainer;
  const wrappedCreateContainer = (...args: any[]) => {
    createdContainer = originalCreateContainer ? originalCreateContainer(...args) : null;
    return createdContainer;
  };

  return originalCreatePostHandler({
    ...opts,
    createContainer: originalCreateContainer ? wrappedCreateContainer : undefined,
    createChatService: () => (createdContainer ? createdContainer.chat : {}) as any,
    createLlmFromAgentConfig: () => ({}) as any,
  });
};

const TEST_ENV = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  OPENAI_MODEL: "gpt-4o-mini",
  OPENAI_EMBED_MODEL: "text-embedding-3-small",
};

const SILENT_LOGS = {
  logInfo: () => {},
  logWarn: () => {},
  logError: () => {},
};

const ALLOWED_AGENT = {
  id: "agent-1",
  ownerUserId: "user-1",
  name: "Agent",
  createdAt: "2026-02-03T00:00:00.000Z",
  updatedAt: "2026-02-03T00:00:00.000Z",
  config: {
    llmProvider: {
      provider: "openai",
      apiKey: "test-valid-key",
      baseURL: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    },
  },
};

const createRequest = (
  input: {
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) =>
  new Request("http://localhost/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(input.headers ?? {}),
    },
    body:
      input.body === undefined
        ? undefined
        : typeof input.body === "string"
          ? input.body
          : JSON.stringify(input.body),
  });

const parseSseEvents = async (response: Response): Promise<Array<Record<string, unknown>>> => {
  const raw = await response.text();
  return raw
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const line = block.split("\n").find((entry) => entry.startsWith("data: "));
      if (!line) return {};
      return JSON.parse(line.slice(6)) as Record<string, unknown>;
    })
    .filter((entry) => Object.keys(entry).length > 0);
};

describe("chat stream route", () => {
  beforeEach(() => {
    chatRateLimiter.reset();
  });

  test("returns 401 when access token cannot be resolved to user", async () => {
    const post = createPostHandler({
      env: TEST_ENV,
      ...SILENT_LOGS,
      resolveApiUserFromAccessToken: async () => null,
    });

    const response = await post(
      createRequest({
        headers: { "x-access-token": "invalid" },
        body: {
          agentId: "agent-1",
          sessionKey: "main",
          userInput: "hello",
        },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Unauthorized");
  });

  test("returns 403 when authenticated user cannot access agent", async () => {
    let chatCalled = false;
    const post = createPostHandler({
      env: TEST_ENV,
      ...SILENT_LOGS,
      resolveApiUserFromAccessToken: async () => ({ id: "user-1" }),
      createContainer: () =>
        ({
          agent: {
            getAgent: async () => {
              throw new ForbiddenError("Agent access denied");
            },
          },
          chat: {
            chatTurnStream: async () => {
              chatCalled = true;
              return {
                sessionId: "session-1",
                stream: (async function* () {
                  yield "should-not-run";
                })(),
              };
            },
          },
        }) as any,
    });

    const response = await post(
      createRequest({
        headers: { "x-access-token": "valid" },
        body: {
          agentId: "agent-2",
          sessionKey: "main",
          userInput: "hello",
        },
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Agent access denied");
    expect(chatCalled).toBe(false);
  });

  test("returns 409 on idempotency conflict before stream starts", async () => {
    const post = createPostHandler({
      env: TEST_ENV,
      ...SILENT_LOGS,
      resolveApiUserFromAccessToken: async () => ({ id: "user-1" }),
      createContainer: () =>
        ({
          agent: {
            getAgent: async () => ALLOWED_AGENT,
          },
          ports: {},
          chat: {
            chatTurnStream: async () => {
              throw new IdempotencyConflictError("duplicate request");
            },
          },
        }) as any,
    });

    const response = await post(
      createRequest({
        headers: { "x-access-token": "valid" },
        body: {
          agentId: "agent-1",
          sessionKey: "main",
          userInput: "hello",
          idempotencyKey: "key-1",
        },
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.text()).toContain("duplicate request");
  });

  test("streams meta/chunk/done events and returns request id header", async () => {
    const post = createPostHandler({
      env: TEST_ENV,
      ...SILENT_LOGS,
      resolveApiUserFromAccessToken: async () => ({ id: "user-1" }),
      createContainer: () =>
        ({
          agent: {
            getAgent: async () => ALLOWED_AGENT,
          },
          ports: {},
          chat: {
            chatTurnStream: async () => ({
              sessionId: "session-1",
              stream: (async function* () {
                yield "hello";
                yield " world";
              })(),
            }),
          },
        }) as any,
    });

    const response = await post(
      createRequest({
        headers: {
          "x-access-token": "valid",
          "x-request-id": "request-abc",
        },
        body: {
          agentId: "agent-1",
          sessionKey: "main",
          userInput: "hello",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-Id")).toBe("request-abc");
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");

    const events = await parseSseEvents(response);
    expect(events.map((entry) => entry.type)).toEqual(["meta", "chunk", "chunk", "done"]);
    expect(events[0]?.sessionId).toBe("session-1");
    expect(events[0]?.requestId).toBe("request-abc");
    expect(events[1]?.value).toBe("hello");
    expect(events[2]?.value).toBe(" world");
  });

  test("returns 500 when stream startup fails with non-idempotency error", async () => {
    const post = createPostHandler({
      env: TEST_ENV,
      ...SILENT_LOGS,
      resolveApiUserFromAccessToken: async () => ({ id: "user-1" }),
      createContainer: () =>
        ({
          agent: {
            getAgent: async () => ALLOWED_AGENT,
          },
          ports: {},
          chat: {
            chatTurnStream: async () => {
              throw new Error("llm unavailable");
            },
          },
        }) as any,
    });

    const response = await post(
      createRequest({
        headers: { "x-access-token": "valid" },
        body: {
          agentId: "agent-1",
          sessionKey: "main",
          userInput: "hello",
        },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Chat stream failed to start");
  });

  test("returns 413 when CHAT_MAX_INPUT_TOKENS is exceeded", async () => {
    let chatCalled = false;
    const post = createPostHandler({
      env: {
        ...TEST_ENV,
        CHAT_MAX_INPUT_TOKENS: "2",
      },
      ...SILENT_LOGS,
      resolveApiUserFromAccessToken: async () => ({ id: "user-1" }),
      createContainer: () =>
        ({
          agent: {
            getAgent: async () => ALLOWED_AGENT,
          },
          ports: {},
          chat: {
            chatTurnStream: async () => {
              chatCalled = true;
              return {
                sessionId: "session-1",
                stream: (async function* () {
                  yield "should-not-run";
                })(),
              };
            },
          },
        }) as any,
    });

    const response = await post(
      createRequest({
        headers: { "x-access-token": "valid" },
        body: {
          agentId: "agent-1",
          sessionKey: "main",
          userInput: "hello world",
        },
      }),
    );

    expect(response.status).toBe(413);
    expect(await response.text()).toContain("chat input exceeds max token limit");
    expect(chatCalled).toBe(false);
  });

  test("returns 429 when daily token hard cap would be exceeded", async () => {
    let chatCalled = false;
    const post = createPostHandler({
      env: {
        ...TEST_ENV,
        CHAT_DAILY_TOKEN_HARD_CAP: "1000",
      },
      ...SILENT_LOGS,
      resolveApiUserFromAccessToken: async () => ({ id: "user-1" }),
      createContainer: () =>
        ({
          agent: {
            getAgent: async () => ALLOWED_AGENT,
          },
          ports: {
            usage: {
              sumUsage: async () => ({
                tokensIn: 700,
                tokensOut: 250,
                costEstimate: 0.01,
              }),
            },
          },
          chat: {
            chatTurnStream: async () => {
              chatCalled = true;
              return {
                sessionId: "session-1",
                stream: (async function* () {
                  yield "should-not-run";
                })(),
              };
            },
          },
        }) as any,
      defaultBudget: {
        modelWindow: 128000,
        reserveOutputTokens: 100,
        reserveToolTokens: 512,
        memoryTopK: 8,
        recentMessages: 20,
      },
    });

    const response = await post(
      createRequest({
        headers: { "x-access-token": "valid" },
        body: {
          agentId: "agent-1",
          sessionKey: "main",
          userInput: "hello",
        },
      }),
    );

    expect(response.status).toBe(429);
    expect(await response.text()).toContain("day token hard cap exceeded");
    expect(chatCalled).toBe(false);
  });

  test("degrades budget and continues when hard cap can be met after downgrade", async () => {
    let capturedOptions: Record<string, unknown> | null = null;
    const post = createPostHandler({
      env: {
        ...TEST_ENV,
        CHAT_DAILY_TOKEN_HARD_CAP: "1000",
        CHAT_BUDGET_DEGRADE_ENABLED: "1",
        CHAT_DEGRADE_RESERVE_OUTPUT_TOKENS: "64",
        CHAT_DEGRADE_MEMORY_TOPK: "2",
        CHAT_DEGRADE_RECENT_MESSAGES: "4",
        OPENAI_FALLBACK_MODEL: "fallback-model",
      },
      ...SILENT_LOGS,
      resolveApiUserFromAccessToken: async () => ({ id: "user-1" }),
      createContainer: () =>
        ({
          agent: {
            getAgent: async () => ALLOWED_AGENT,
          },
          ports: {
            usage: {
              sumUsage: async () => ({
                tokensIn: 900,
                tokensOut: 0,
                costEstimate: 0.01,
              }),
            },
          },
          chat: {
            chatTurnStream: async (
              _agentId: string,
              _sessionKey: string,
              _userInput: string,
              options: Record<string, unknown>,
            ) => {
              capturedOptions = options;
              return {
                sessionId: "session-1",
                stream: (async function* () {
                  yield "ok";
                })(),
              };
            },
          },
        }) as any,
      defaultBudget: {
        modelWindow: 128000,
        reserveOutputTokens: 180,
        reserveToolTokens: 512,
        memoryTopK: 8,
        recentMessages: 20,
      },
    });

    const response = await post(
      createRequest({
        headers: { "x-access-token": "valid" },
        body: {
          agentId: "agent-1",
          sessionKey: "main",
          userInput: "hello",
        },
      }),
    );

    expect(response.status).toBe(200);
    if (!capturedOptions) {
      throw new Error("Expected stream options to be captured");
    }
    expect(capturedOptions["budget"]).toMatchObject({
      reserveOutputTokens: 64,
      memoryTopK: 2,
      recentMessages: 4,
    });
    expect(capturedOptions["usageMeta"]).toMatchObject({
      model_route_strategy: "primary_only",
      model_route_primary: "gpt-4o-mini",
      model_route_fallback: null,
      budget_degraded: true,
      reserve_output_tokens_after: 64,
      memory_top_k_after: 2,
      recent_messages_after: 4,
    });
  });

  test("returns 429 when qps rate limit is exceeded", async () => {
    const post = createPostHandler({
      env: {
        ...TEST_ENV,
        CHAT_QPS_LIMIT: "1",
      },
      ...SILENT_LOGS,
      resolveApiUserFromAccessToken: async () => ({ id: "user-1" }),
      createContainer: () =>
        ({
          agent: {
            getAgent: async () => ALLOWED_AGENT,
          },
          ports: {},
          chat: {
            chatTurnStream: async () => ({
              sessionId: "session-1",
              stream: (async function* () {
                yield "ok";
              })(),
            }),
          },
        }) as any,
    });

    const request = () =>
      createRequest({
        headers: { "x-access-token": "valid" },
        body: {
          agentId: "agent-1",
          sessionKey: "main",
          userInput: "hello",
        },
      });

    const first = await post(request());
    expect(first.status).toBe(200);

    const second = await post(request());
    expect(second.status).toBe(429);
    expect(await second.text()).toContain("rate limit");
  });

  test("returns 429 when db rate-limit store blocks request", async () => {
    let chatCalled = false;
    const post = createPostHandler({
      env: {
        ...TEST_ENV,
        CHAT_QPS_LIMIT: "1",
      },
      ...SILENT_LOGS,
      resolveApiUserFromAccessToken: async () => ({ id: "user-1" }),
      createContainer: () =>
        ({
          agent: {
            getAgent: async () => ALLOWED_AGENT,
          },
          ports: {
            rateLimit: {
              consumeLimit: async () => ({
                allowed: false,
                retryAfterMs: 300,
              }),
            },
          },
          chat: {
            chatTurnStream: async () => {
              chatCalled = true;
              return {
                sessionId: "session-1",
                stream: (async function* () {
                  yield "ok";
                })(),
              };
            },
          },
        }) as any,
    });

    const response = await post(
      createRequest({
        headers: { "x-access-token": "valid" },
        body: {
          agentId: "agent-1",
          sessionKey: "main",
          userInput: "hello",
        },
      }),
    );

    expect(response.status).toBe(429);
    expect(await response.text()).toContain("rate limit");
    expect(chatCalled).toBe(false);
  });
});
