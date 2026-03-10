import { ValidationError } from "../errors";
import type { MemoryItem } from "../types";
import type { Clock, LlmPort, MemoryStore } from "../container/types";

export function createMemoryService(ports: { memory: MemoryStore; llm: LlmPort; clock: Clock }) {
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
      },
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
      filters?: {
        sensitivity?: MemoryItem["sensitivity"][];
        contextEligible?: boolean;
        scopeType?: MemoryItem["scopeType"];
        scopeId?: string;
      },
    ): Promise<MemoryItem[]> {
      const embedding = await ports.llm.embed({ text: query });
      return ports.memory.queryTopK({
        agentId,
        embedding,
        topK,
        sensitivity: filters?.sensitivity,
        contextEligible: filters?.contextEligible ?? true,
        scopeType: filters?.scopeType,
        scopeId: filters?.scopeId,
      });
    },

    async listMemoryItems(agentId: string, limit: number): Promise<MemoryItem[]> {
      return ports.memory.listMemoryItems({ agentId, limit });
    },

    async updateMemoryItem(
      agentId: string,
      memoryId: string,
      input: {
        content?: string;
        tags?: string[];
        sensitivity?: MemoryItem["sensitivity"];
        contextEligible?: boolean;
      },
    ): Promise<MemoryItem> {
      const trimmedMemoryId = memoryId.trim();
      if (!trimmedMemoryId) {
        throw new ValidationError("Memory id is required");
      }

      let normalizedContent: string | undefined;
      let embedding: number[] | undefined;
      if (input.content !== undefined) {
        normalizedContent = input.content.trim();
        if (!normalizedContent) {
          throw new ValidationError("Memory content is required");
        }
        embedding = await ports.llm.embed({ text: normalizedContent });
      }

      return ports.memory.updateMemoryItem({
        agentId,
        id: trimmedMemoryId,
        content: normalizedContent,
        tags: input.tags,
        sensitivity: input.sensitivity,
        contextEligible: input.contextEligible,
        embedding,
        now: ports.clock.now(),
      });
    },

    async deleteMemoryItem(agentId: string, memoryId: string): Promise<void> {
      const trimmedMemoryId = memoryId.trim();
      if (!trimmedMemoryId) {
        throw new ValidationError("Memory id is required");
      }
      await ports.memory.deleteMemoryItem({ agentId, id: trimmedMemoryId });
    },
  };
}
