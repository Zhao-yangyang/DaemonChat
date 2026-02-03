import { ValidationError } from "../errors";
import type { MemoryItem } from "../types";
import type { Clock, LlmPort, MemoryStore } from "../container/types";

export function createMemoryService(ports: {
  memory: MemoryStore;
  llm: LlmPort;
  clock: Clock;
}) {
  return {
    async writeMemoryItem(
      agentId: string,
      input: {
        scopeType: MemoryItem["scopeType"];
        scopeId: string;
        type: MemoryItem["type"];
        content: string;
        tags: string[];
        sensitivity: MemoryItem["sensitivity"];
        contextEligible: boolean;
        embedding?: number[];
      }
    ): Promise<MemoryItem> {
      const trimmed = input.content.trim();
      if (!trimmed) {
        throw new ValidationError("Memory content is required");
      }

      const embedding = input.embedding ?? (await ports.llm.embed({ text: trimmed }));

      return ports.memory.insertMemoryItem({
        agentId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        type: input.type,
        content: trimmed,
        tags: input.tags,
        sensitivity: input.sensitivity,
        contextEligible: input.contextEligible,
        embedding,
        now: ports.clock.now(),
      });
    },

    async retrieveTopMemory(
      agentId: string,
      query: string,
      topK: number,
      filters?: { sensitivity?: MemoryItem["sensitivity"][]; contextEligible?: boolean }
    ): Promise<MemoryItem[]> {
      const embedding = await ports.llm.embed({ text: query });
      return ports.memory.queryTopK({
        agentId,
        embedding,
        topK,
        sensitivity: filters?.sensitivity,
        contextEligible: filters?.contextEligible ?? true,
      });
    },

    async listMemoryItems(agentId: string, limit: number): Promise<MemoryItem[]> {
      return ports.memory.listMemoryItems({ agentId, limit });
    },
  };
}
