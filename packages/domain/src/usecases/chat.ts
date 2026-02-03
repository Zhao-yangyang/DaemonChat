import { buildContextPack } from "../context/buildContextPack";
import type { ContextBudget, ContextPack, TranscriptEvent } from "../types";
import type {
  Clock,
  LlmPort,
  MemoryStore,
  SessionStore,
  TranscriptStore,
  UsageStore,
} from "../container/types";
import { createSessionService } from "./session";
import { createMemoryService } from "./memory";
import { createCompactionService } from "./compaction";

const defaultApproxTokens = (text: string): number => Math.ceil(text.length / 4);

export function createChatService(ports: {
  sessions: SessionStore;
  transcripts: TranscriptStore;
  memory: MemoryStore;
  usage: UsageStore;
  llm: LlmPort;
  clock: Clock;
}) {
  const sessions = createSessionService({ sessions: ports.sessions, clock: ports.clock });
  const memory = createMemoryService({ memory: ports.memory, llm: ports.llm, clock: ports.clock });
  const compaction = createCompactionService({
    transcripts: ports.transcripts,
    llm: ports.llm,
    clock: ports.clock,
  });

  return {
    async chatTurn(
      agentId: string,
      sessionKey: string,
      userInput: string,
      options: {
        system: string;
        constraints: string[];
        taskState: string | null;
        memoryTopK: number;
        recentMessages: number;
        budget: ContextBudget;
      }
    ): Promise<{
      sessionId: string;
      assistantText: string;
      context: ContextPack;
    }> {
      const session = await sessions.resolveSession(agentId, sessionKey);

      const memoryItems = await memory.retrieveTopMemory(agentId, userInput, options.memoryTopK, {
        contextEligible: true,
      });

      const recentMessages = await ports.transcripts.listRecentEvents({
        agentId,
        sessionId: session.id,
        limit: options.recentMessages,
      });

      const userTokens = defaultApproxTokens(userInput);
      await ports.transcripts.appendEvent({
        agentId,
        sessionId: session.id,
        type: "user_message",
        content: { text: userInput },
        tokensIn: userTokens,
        tokensOut: null,
        createdAt: ports.clock.now(),
      });

      const context = buildContextPack({
        system: options.system,
        constraints: options.constraints,
        taskState: options.taskState,
        memoryItems,
        recentMessages,
        userInput,
        budget: options.budget,
      });

      let assistantText = "";
      for await (const chunk of ports.llm.streamChat({ messages: context.messages })) {
        assistantText = assistantText
          ? `${assistantText} ${chunk}`.trim()
          : chunk;
      }

      const assistantTokens = defaultApproxTokens(assistantText);

      await ports.transcripts.appendEvent({
        agentId,
        sessionId: session.id,
        type: "assistant_message",
        content: { text: assistantText },
        tokensIn: null,
        tokensOut: assistantTokens,
        createdAt: ports.clock.now(),
      });

      await ports.usage.insertUsageEvent({
        agentId,
        eventType: "llm",
        tokensIn: userTokens,
        tokensOut: assistantTokens,
        costEstimate: null,
        meta: { model: "" },
        createdAt: ports.clock.now(),
      });

      await compaction.compactIfNeeded(agentId, session.id, {
        shouldCompact: context.shouldCompact,
        messages: context.messages,
      });

      return {
        sessionId: session.id,
        assistantText,
        context,
      };
    },
  };
}
