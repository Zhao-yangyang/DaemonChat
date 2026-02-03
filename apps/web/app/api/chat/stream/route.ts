import { createContainer } from "@/src/server/container";

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  OPENAI_EMBED_MODEL: process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small",
};

const DEFAULT_BUDGET = {
  modelWindow: Number(process.env.MODEL_CONTEXT_WINDOW ?? 128000),
  reserveOutputTokens: Number(process.env.RESERVE_OUTPUT_TOKENS ?? 2048),
  reserveToolTokens: Number(process.env.RESERVE_TOOL_TOKENS ?? 512),
  memoryTopK: Number(process.env.MEMORY_TOPK ?? 8),
  recentMessages: Number(process.env.RECENT_MESSAGES ?? 20),
};

type ChatStreamInput = {
  agentId: string;
  sessionKey: string;
  userInput: string;
  system?: string;
};

const sendEvent = (controller: ReadableStreamDefaultController, data: unknown) => {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(payload));
};

export async function POST(req: Request) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return new Response("Missing SUPABASE_URL or SUPABASE_ANON_KEY", { status: 500 });
  }

  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: ChatStreamInput;
  try {
    body = (await req.json()) as ChatStreamInput;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (!body.agentId || !body.sessionKey || !body.userInput) {
    return new Response("Missing agentId/sessionKey/userInput", { status: 400 });
  }

  const accessToken = req.headers.get("x-access-token") ?? undefined;
  const container = createContainer(env, accessToken);
  const result = await container.chat.chatTurnStream(
    body.agentId,
    body.sessionKey,
    body.userInput,
    {
      system: body.system || "You are a helpful AI assistant.",
      constraints: [],
      taskState: null,
      memoryTopK: DEFAULT_BUDGET.memoryTopK,
      recentMessages: DEFAULT_BUDGET.recentMessages,
      budget: DEFAULT_BUDGET,
    }
  );

  const iterator = result.stream[Symbol.asyncIterator]();

  const stream = new ReadableStream({
    async start(controller) {
      sendEvent(controller, { type: "meta", sessionId: result.sessionId });
      try {
        while (true) {
          const { value, done } = await iterator.next();
          if (done) break;
          sendEvent(controller, { type: "chunk", value });
        }
        sendEvent(controller, { type: "done" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "stream error";
        sendEvent(controller, { type: "error", message });
      } finally {
        controller.close();
      }
    },
    async cancel() {
      if (iterator.return) {
        await iterator.return();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
