import { buildContextPack } from "../context/buildContextPack";
import { IdempotencyConflictError } from "../errors";
import type { ContextBudget, ContextPack, MemoryItem, TranscriptEvent } from "../types";
import type {
  ChatContentPart,
  ChatMessageContent,
  Clock,
  JobQueue,
  AbortSignalLike,
  LlmModelSelection,
  LlmPort,
  MemoryStore,
  SessionStore,
  TokenizerPort,
  TranscriptStore,
  UsageStore,
} from "../container/types";
import { createSessionService } from "./session";
import { createMemoryService } from "./memory";
import { createCompactionService } from "./compaction";

const defaultApproxTokens = (text: string): number => Math.ceil(text.length / 4);
const PROMPT_VERSION = "v1";
const CONTEXT_POLICY_VERSION = "v1";

const isUniqueViolationError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; message?: string };
  return (
    value.code === "23505" ||
    value.message?.toLowerCase().includes("duplicate key") === true
  );
};

const extractEventText = (event: TranscriptEvent): string => {
  const text = (event.content as { text?: unknown }).text;
  return typeof text === "string" ? text : "";
};

type ChatTurnOptions = {
  system: string;
  constraints: string[];
  taskState: string | null;
  memoryTopK: number;
  recentMessages: number;
  memoryScope?: {
    scopeType: MemoryItem["scopeType"];
    scopeId: string;
  };
  includePrivateMemory?: boolean;
  idempotencyKey?: string;
  model?: string;
  imageUrls?: Array<{ url: string; mimeType?: string }>;
  pricing?: {
    inputPer1MUsd: number;
    outputPer1MUsd: number;
  };
  usageMeta?: Record<string, unknown>;
  budget: ContextBudget;
  abortSignal?: AbortSignalLike;
};

const estimateCostUsd = (input: {
  tokensIn: number;
  tokensOut: number;
  pricing?: {
    inputPer1MUsd: number;
    outputPer1MUsd: number;
  };
}): number | null => {
  if (!input.pricing) return null;
  const inCost = (input.tokensIn / 1_000_000) * input.pricing.inputPer1MUsd;
  const outCost = (input.tokensOut / 1_000_000) * input.pricing.outputPer1MUsd;
  return Number((inCost + outCost).toFixed(8));
};

const buildTurnUsageMeta = (
  usageMeta: Record<string, unknown> | undefined,
  modelSelection: LlmModelSelection | null,
  configuredModel: string | undefined
): Record<string, unknown> => ({
  ...(usageMeta ?? {}),
  model_route_selected: modelSelection?.route ?? "unknown",
  model_used: modelSelection?.model ?? configuredModel ?? "",
});

export function createChatService(ports: {
  jobs?: JobQueue;
  sessions: SessionStore;
  transcripts: TranscriptStore;
  memory: MemoryStore;
  usage: UsageStore;
  llm: LlmPort;
  clock: Clock;
  tokenizer?: TokenizerPort;
}) {
  const sessions = createSessionService({ sessions: ports.sessions, clock: ports.clock });
  const memory = createMemoryService({ memory: ports.memory, llm: ports.llm, clock: ports.clock });
  const compaction = createCompactionService({
    transcripts: ports.transcripts,
    llm: ports.llm,
    clock: ports.clock,
  });

  const countTokens = (text: string, model?: string): number =>
    ports.tokenizer?.countTokens({ text, model }) ?? defaultApproxTokens(text);

  const buildContextForSession = async (
    agentId: string,
    sessionId: string,
    userInput: string,
    options: ChatTurnOptions
  ) => {
    const memoryItems = await memory.retrieveTopMemory(agentId, userInput, options.memoryTopK, {
      contextEligible: true,
      sensitivity: options.includePrivateMemory ? ["public", "private"] : ["public"],
      scopeType: options.memoryScope?.scopeType,
      scopeId: options.memoryScope?.scopeId,
    });

    const recentMessages = await ports.transcripts.listRecentEvents({
      agentId,
      sessionId,
      limit: options.recentMessages,
    });

    const context = buildContextPack({
      system: options.system,
      constraints: options.constraints,
      taskState: options.taskState,
      memoryItems,
      recentMessages,
      userInput,
      imageUrls: options.imageUrls,
      model: options.model,
      countTokens: ({ text, model }) => countTokens(text, model),
      budget: options.budget,
    });

    return context;
  };

  const appendUserEvent = async (input: {
    agentId: string;
    sessionId: string;
    userInput: string;
    model?: string;
    requestId?: string;
  }) => {
    const userTokens = countTokens(input.userInput, input.model);
    await ports.transcripts.appendEvent({
      agentId: input.agentId,
      sessionId: input.sessionId,
      requestId: input.requestId ?? null,
      type: "user_message",
      content: { text: input.userInput },
      tokensIn: userTokens,
      tokensOut: null,
      createdAt: ports.clock.now(),
    });
    return userTokens;
  };

  const getIdempotentState = async (input: {
    agentId: string;
    sessionId: string;
    requestId?: string;
  }): Promise<{ assistantText: string } | { inProgress: true } | null> => {
    if (!input.requestId) return null;
    const events = await ports.transcripts.listEventsByRequestId({
      agentId: input.agentId,
      sessionId: input.sessionId,
      requestId: input.requestId,
    });
    const assistantEvent = [...events]
      .reverse()
      .find((event) => event.type === "assistant_message");
    if (assistantEvent) {
      return { assistantText: extractEventText(assistantEvent) };
    }

    if (events.some((event) => event.type === "user_message")) {
      return { inProgress: true };
    }
    return null;
  };

  const asReplayStream = (assistantText: string): AsyncIterable<string> =>
    (async function* () {
      if (assistantText) {
        yield assistantText;
      }
    })();

  const replayResponse = async (input: {
    agentId: string;
    sessionId: string;
    userInput: string;
    options: ChatTurnOptions;
    assistantText: string;
  }) => {
    const context = await buildContextForSession(
      input.agentId,
      input.sessionId,
      input.userInput,
      input.options
    );
    return {
      sessionId: input.sessionId,
      assistantText: input.assistantText,
      context,
    };
  };

  const ensureNoInFlightConflict = (state: { inProgress: true } | null) => {
    if (state?.inProgress) {
      throw new IdempotencyConflictError();
    }
  };

  const finalizeTurn = async (input: {
    agentId: string;
    sessionId: string;
    requestId?: string;
    model?: string;
    pricing?: {
      inputPer1MUsd: number;
      outputPer1MUsd: number;
    };
    usageMeta?: Record<string, unknown>;
    assistantText: string;
    userTokens: number;
    context: ContextPack;
    memoryScope?: {
      scopeType: MemoryItem["scopeType"];
      scopeId: string;
    };
  }) => {
    const assistantTokens = countTokens(input.assistantText, input.model);
    const costEstimate = estimateCostUsd({
      tokensIn: input.userTokens,
      tokensOut: assistantTokens,
      pricing: input.pricing,
    });

    await ports.transcripts.appendEvent({
      agentId: input.agentId,
      sessionId: input.sessionId,
      requestId: input.requestId ?? null,
      type: "assistant_message",
      content: { text: input.assistantText },
      tokensIn: null,
      tokensOut: assistantTokens,
      createdAt: ports.clock.now(),
    });

    await ports.usage.insertUsageEvent({
      agentId: input.agentId,
      eventType: "llm",
      tokensIn: input.userTokens,
      tokensOut: assistantTokens,
      costEstimate,
      meta: {
        model: input.model ?? "",
        request_id: input.requestId ?? null,
        prompt_version: PROMPT_VERSION,
        context_policy_version: CONTEXT_POLICY_VERSION,
        ...(input.usageMeta ?? {}),
      },
      createdAt: ports.clock.now(),
    });

    await compaction.compactIfNeeded(input.agentId, input.sessionId, {
      shouldCompact: input.context.shouldCompact,
      messages: input.context.messages,
    });

    if (ports.jobs && input.memoryScope) {
      try {
        await ports.jobs.enqueue({
          type: "MEMORY_FLUSH",
          payload: {
            agentId: input.agentId,
            sessionId: input.sessionId,
            scopeType: input.memoryScope.scopeType,
            scopeId: input.memoryScope.scopeId,
          },
        });
      } catch {
        // best effort: memory flush enqueue should not block chat completion
      }
    }
  };

  return {
    async chatTurn(
      agentId: string,
      sessionKey: string,
      userInput: string,
      options: ChatTurnOptions
    ): Promise<{
      sessionId: string;
      assistantText: string;
      context: ContextPack;
    }> {
      const session = await sessions.resolveSession(agentId, sessionKey);
      const idempotentState = await getIdempotentState({
        agentId,
        sessionId: session.id,
        requestId: options.idempotencyKey,
      });

      if (idempotentState && "assistantText" in idempotentState) {
        return replayResponse({
          agentId,
          sessionId: session.id,
          userInput,
          options,
          assistantText: idempotentState.assistantText,
        });
      }
      ensureNoInFlightConflict(
        idempotentState && "inProgress" in idempotentState ? idempotentState : null
      );

      const context = await buildContextForSession(agentId, session.id, userInput, options);
      let userTokens = 0;
      try {
        userTokens = await appendUserEvent({
          agentId,
          sessionId: session.id,
          userInput,
          model: options.model,
          requestId: options.idempotencyKey,
        });
      } catch (error) {
        if (!(options.idempotencyKey && isUniqueViolationError(error))) {
          throw error;
        }
        const conflictState = await getIdempotentState({
          agentId,
          sessionId: session.id,
          requestId: options.idempotencyKey,
        });
        if (conflictState && "assistantText" in conflictState) {
          return {
            sessionId: session.id,
            assistantText: conflictState.assistantText,
            context,
          };
        }
        ensureNoInFlightConflict(
          conflictState && "inProgress" in conflictState ? conflictState : null
        );
        throw error;
      }

      let assistantText = "";
      let modelSelection: LlmModelSelection | null = null;
      for await (const chunk of ports.llm.streamChat({
        messages: context.messages,
        model: options.model,
        onModelResolved: (selection) => {
          modelSelection = selection;
        },
        abortSignal: options.abortSignal,
      })) {
        assistantText = assistantText
          ? `${assistantText} ${chunk}`.trim()
          : chunk;
      }
      await finalizeTurn({
        agentId,
        sessionId: session.id,
        requestId: options.idempotencyKey,
        model: options.model,
        pricing: options.pricing,
        usageMeta: buildTurnUsageMeta(options.usageMeta, modelSelection, options.model),
        assistantText,
        userTokens,
        context,
        memoryScope: options.memoryScope,
      });

      return {
        sessionId: session.id,
        assistantText,
        context,
      };
    },

    async chatTurnStream(
      agentId: string,
      sessionKey: string,
      userInput: string,
      options: ChatTurnOptions
    ): Promise<{
      sessionId: string;
      context: ContextPack;
      stream: AsyncIterable<string>;
    }> {
      const session = await sessions.resolveSession(agentId, sessionKey);
      const idempotentState = await getIdempotentState({
        agentId,
        sessionId: session.id,
        requestId: options.idempotencyKey,
      });

      if (idempotentState && "assistantText" in idempotentState) {
        const context = await buildContextForSession(agentId, session.id, userInput, options);
        return {
          sessionId: session.id,
          context,
          stream: asReplayStream(idempotentState.assistantText),
        };
      }
      ensureNoInFlightConflict(
        idempotentState && "inProgress" in idempotentState ? idempotentState : null
      );

      const context = await buildContextForSession(agentId, session.id, userInput, options);
      let userTokens = 0;
      try {
        userTokens = await appendUserEvent({
          agentId,
          sessionId: session.id,
          userInput,
          model: options.model,
          requestId: options.idempotencyKey,
        });
      } catch (error) {
        if (!(options.idempotencyKey && isUniqueViolationError(error))) {
          throw error;
        }
        const conflictState = await getIdempotentState({
          agentId,
          sessionId: session.id,
          requestId: options.idempotencyKey,
        });
        if (conflictState && "assistantText" in conflictState) {
          return {
            sessionId: session.id,
            context,
            stream: asReplayStream(conflictState.assistantText),
          };
        }
        ensureNoInFlightConflict(
          conflictState && "inProgress" in conflictState ? conflictState : null
        );
        throw error;
      }

      const stream = async function* () {
        let assistantText = "";
        let modelSelection: LlmModelSelection | null = null;
        try {
          for await (const chunk of ports.llm.streamChat({
            messages: context.messages,
            model: options.model,
            onModelResolved: (selection) => {
              modelSelection = selection;
            },
            abortSignal: options.abortSignal,
          })) {
            assistantText += chunk;
            yield chunk;
          }
        } finally {
          await finalizeTurn({
            agentId,
            sessionId: session.id,
            requestId: options.idempotencyKey,
            model: options.model,
            pricing: options.pricing,
            usageMeta: buildTurnUsageMeta(options.usageMeta, modelSelection, options.model),
            assistantText: assistantText.trim(),
            userTokens,
            context,
            memoryScope: options.memoryScope,
          });
        }
      }();

      return { sessionId: session.id, context, stream };
    },
  };
}
