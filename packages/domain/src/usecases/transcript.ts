import type { TranscriptEvent } from "../types";
import type { TranscriptStore } from "../container/types";

export function createTranscriptService(ports: { transcripts: TranscriptStore }) {
  return {
    async appendEvent(
      agentId: string,
      sessionId: string,
      event: {
        type: TranscriptEvent["type"];
        content: TranscriptEvent["content"];
        tokensIn: number | null;
        tokensOut: number | null;
        createdAt: string;
      }
    ): Promise<TranscriptEvent> {
      return ports.transcripts.appendEvent({
        agentId,
        sessionId,
        type: event.type,
        content: event.content,
        tokensIn: event.tokensIn,
        tokensOut: event.tokensOut,
        createdAt: event.createdAt,
      });
    },

    async loadRecentContext(
      agentId: string,
      sessionId: string,
      limit: number
    ): Promise<TranscriptEvent[]> {
      return ports.transcripts.listRecentEvents({ agentId, sessionId, limit });
    },

    async loadLatestCompaction(
      agentId: string,
      sessionId: string
    ): Promise<TranscriptEvent | null> {
      return ports.transcripts.getLatestCompaction({ agentId, sessionId });
    },
  };
}
