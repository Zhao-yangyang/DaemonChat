import { createContainer } from "@/src/server/container";
import { logError, logInfo, logWarn, serializeError } from "@/src/server/logger";
import { consumeChatRateLimit } from "@daemon/api";
import { DEFAULT_AGENT_CONFIG, DEFAULT_SYSTEM_PROMPT } from "@daemon/domain";
import { createLlmFromAgentConfig } from "@daemon/adapters-llm-vercel";
import type { ChatMessageContent } from "@daemon/domain";

const getEnv = () => ({
  SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY:
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
});

const getAnonymousChatEnabled = () =>
  process.env.ANONYMOUS_CHAT_ENABLED === "1" ||
  process.env.ANONYMOUS_CHAT_ENABLED === "true" ||
  process.env.ANONYMOUS_CHAT_ENABLED === "yes";
const getAnonymousChatMaxTurns = () =>
  Math.min(10, Math.max(1, Number(process.env.ANONYMOUS_CHAT_MAX_TURNS) || 3));
const getAnonymousChatRateLimitPerIp = () =>
  Math.min(60, Math.max(1, Number(process.env.ANONYMOUS_CHAT_RATE_LIMIT_PER_IP) || 10));

const ROUTE_PATH = "/api/chat/stream/anonymous";

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

const sendEvent = (controller: ReadableStreamDefaultController, data: unknown) => {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(payload));
};

type AnonymousBody = {
  agentId: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  userInput: string;
};

function parseBody(value: unknown): AnonymousBody | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const agentId = typeof obj.agentId === "string" ? obj.agentId : undefined;
  const userInput = typeof obj.userInput === "string" ? obj.userInput : undefined;
  const messagesRaw = Array.isArray(obj.messages) ? obj.messages : [];
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of messagesRaw) {
    if (m && typeof m === "object" && "role" in m && "content" in m) {
      const role = (m as { role: string }).role;
      const content = (m as { content: unknown }).content;
      if ((role === "user" || role === "assistant") && typeof content === "string") {
        messages.push({ role, content });
      }
    }
  }
  if (!agentId || !userInput) return null;
  return { agentId, messages, userInput };
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

  if (!getAnonymousChatEnabled()) {
    logWarn("anonymous_chat.disabled", {
      request_id: requestId,
      route: ROUTE_PATH,
      error_code: "FORBIDDEN",
      latency_ms: Date.now() - startedAt,
    });
    return new Response("Anonymous chat is disabled", { status: 403 });
  }

  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    logError("anonymous_chat.server_config_error", {
      request_id: requestId,
      route: ROUTE_PATH,
      error_code: "SERVER_CONFIG",
    });
    return new Response("Server configuration error", { status: 500 });
  }

  let body: AnonymousBody;
  try {
    const parsed = parseBody(await req.json());
    if (!parsed) {
      return new Response("Missing or invalid agentId, messages, userInput", {
        status: 400,
      });
    }
    body = parsed;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const maxTurns = getAnonymousChatMaxTurns();
  const turnCount = body.messages.filter((m) => m.role === "user").length + 1;
  if (turnCount > maxTurns) {
    logWarn("anonymous_chat.max_turns_exceeded", {
      request_id: requestId,
      route: ROUTE_PATH,
      agent_id: body.agentId,
      turn_count: turnCount,
      max_turns: maxTurns,
      error_code: "MAX_TURNS_EXCEEDED",
      latency_ms: Date.now() - startedAt,
    });
    return new Response(
      JSON.stringify({
        error: "max_turns_exceeded",
        maxTurns,
        message: "试用轮次已达上限，登录后可继续对话",
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const clientIp = getClientIp(req);
  const rateLimitKey = `anon:${clientIp}`;
  const container = createContainer(env, undefined);

  const rateCheck = await consumeChatRateLimit({
    store: container.ports?.rateLimit,
    key: rateLimitKey,
    qpm: getAnonymousChatRateLimitPerIp(),
  });
  if (!rateCheck.allowed) {
    logWarn("anonymous_chat.rate_limited", {
      request_id: requestId,
      route: ROUTE_PATH,
      agent_id: body.agentId,
      client_ip: clientIp,
      error_code: "RATE_LIMITED",
      latency_ms: Date.now() - startedAt,
    });
    return new Response("Rate limit exceeded", {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil(rateCheck.retryAfterMs / 1000)),
      },
    });
  }

  const agent = await container.agent.getPublicAgent(body.agentId);
  if (!agent) {
    logWarn("anonymous_chat.agent_not_found", {
      request_id: requestId,
      route: ROUTE_PATH,
      agent_id: body.agentId,
      error_code: "NOT_FOUND",
      latency_ms: Date.now() - startedAt,
    });
    return new Response("Agent not found or not public", { status: 404 });
  }

  const agentConfig = { ...DEFAULT_AGENT_CONFIG, ...(agent.config ?? {}) };
  const llmProvider = agentConfig.llmProvider;
  if (!llmProvider || !llmProvider.apiKey || !llmProvider.baseURL || !llmProvider.model) {
    logWarn("anonymous_chat.llm_not_configured", {
      request_id: requestId,
      route: ROUTE_PATH,
      agent_id: body.agentId,
      error_code: "LLM_NOT_CONFIGURED",
      latency_ms: Date.now() - startedAt,
    });
    return new Response("Agent 未配置 LLM，无法试用", { status: 400 });
  }

  let llm;
  try {
    llm = createLlmFromAgentConfig(
      { ...llmProvider, model: llmProvider.model },
      { temperature: agentConfig.temperature },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "LLM 创建失败";
    logError("anonymous_chat.llm_create_failed", {
      request_id: requestId,
      route: ROUTE_PATH,
      agent_id: body.agentId,
      error_code: "LLM_CREATE_FAILED",
      error_message: message,
      latency_ms: Date.now() - startedAt,
    });
    return new Response(message, { status: 400 });
  }

  const systemPrompt = (agentConfig.systemPrompt as string) || DEFAULT_SYSTEM_PROMPT;
  const messages: Array<{ role: "system" | "user" | "assistant"; content: ChatMessageContent }> = [
    { role: "system", content: systemPrompt },
    ...body.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as ChatMessageContent,
    })),
    { role: "user", content: body.userInput },
  ];

  const abortController = new AbortController();
  const syncAbortFromRequest = () => {
    if (!abortController.signal.aborted) abortController.abort();
  };
  req.signal.addEventListener("abort", syncAbortFromRequest);
  if (req.signal.aborted) syncAbortFromRequest();

  const pseudoSessionId = `anon-${requestId}`;
  let _assistantText = "";
  let streamClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      sendEvent(controller, {
        type: "meta",
        sessionId: pseudoSessionId,
        requestId,
      });
      try {
        for await (const chunk of llm.streamChat({
          messages,
          model: llmProvider.model,
          abortSignal: abortController.signal,
        })) {
          _assistantText += chunk ?? "";
          sendEvent(controller, { type: "chunk", value: chunk });
        }
        sendEvent(controller, { type: "done" });
        logInfo("anonymous_chat.completed", {
          request_id: requestId,
          route: ROUTE_PATH,
          agent_id: body.agentId,
          client_ip: clientIp,
          turn_count: turnCount,
          latency_ms: Date.now() - startedAt,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "stream error";
        sendEvent(controller, { type: "error", message });
        const details = serializeError(error);
        logError("anonymous_chat.failed", {
          request_id: requestId,
          route: ROUTE_PATH,
          agent_id: body.agentId,
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
    cancel() {
      syncAbortFromRequest();
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
}
