import type { ContextMessage, TranscriptEvent } from "../types";
import type { Clock, LlmPort, TranscriptStore } from "../container/types";

export function createCompactionService(ports: {
  transcripts: TranscriptStore;
  llm: LlmPort;
  clock: Clock;
}) {
  return {
    async compactIfNeeded(
      agentId: string,
      sessionId: string,
      input: {
        shouldCompact: boolean;
        messages: ContextMessage[];
      }
    ): Promise<TranscriptEvent | null> {
      if (!input.shouldCompact) {
        return null;
      }

      const summary = await ports.llm.completeChat({
        messages: [
          {
            role: "system",
            content:
              "Summarize the conversation for future context. Focus on key facts, preferences, and tasks.",
          },
          ...input.messages,
        ],
      });

      return ports.transcripts.appendEvent({
        agentId,
        sessionId,
        type: "compaction",
        content: { summary },
        tokensIn: null,
        tokensOut: null,
        createdAt: ports.clock.now(),
      });
    },
  };
}
