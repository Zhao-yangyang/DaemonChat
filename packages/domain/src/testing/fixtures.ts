import type { LlmPort, Ports } from "../container/types";
import type { MemoryItem, Timestamp } from "../types";
import { FixedClock } from "./clock";
import { createInMemoryStores } from "./memoryStores";

const defaultEmbed = async (input: { text: string }): Promise<number[]> => {
  return [input.text.length, 0, 0];
};

const defaultStream = async function* (): AsyncIterable<string> {
  yield "";
};

const defaultComplete = async (): Promise<string> => "";

export function createTestPorts(options?: {
  now?: Timestamp;
  llm?: Partial<LlmPort>;
}): { ports: Ports; stores: ReturnType<typeof createInMemoryStores> } {
  const stores = createInMemoryStores();
  const clock = new FixedClock(options?.now ?? "2026-02-03T00:00:00Z");

  const llm: LlmPort = {
    streamChat: options?.llm?.streamChat ?? defaultStream,
    completeChat: options?.llm?.completeChat ?? defaultComplete,
    embed: options?.llm?.embed ?? defaultEmbed,
  };

  return {
    ports: {
      clock,
      agents: stores.agents,
      sessions: stores.sessions,
      transcripts: stores.transcripts,
      memory: stores.memory,
      usage: stores.usage,
      audit: stores.audit,
      jobs: stores.jobs,
      llm,
    },
    stores,
  };
}

export async function seedAgent(ports: Ports, input: { ownerUserId: string; name: string }): Promise<string> {
  const agent = await ports.agents.createAgent({
    ownerUserId: input.ownerUserId,
    name: input.name,
    now: ports.clock.now(),
  });
  return agent.id;
}

export async function seedSession(
  ports: Ports,
  input: { agentId: string; sessionKey: string }
): Promise<string> {
  const session = await ports.sessions.createSession({
    agentId: input.agentId,
    sessionKey: input.sessionKey,
    now: ports.clock.now(),
  });
  return session.id;
}

export function buildMemoryInput(partial: Partial<MemoryItem> & { agentId: string }): Omit<MemoryItem, "id" | "createdAt" | "updatedAt"> {
  return {
    agentId: partial.agentId,
    scopeType: partial.scopeType ?? "user",
    scopeId: partial.scopeId ?? "user-1",
    type: partial.type ?? "fact",
    content: partial.content ?? "memory",
    tags: partial.tags ?? [],
    sensitivity: partial.sensitivity ?? "public",
    contextEligible: partial.contextEligible ?? true,
    embedding: partial.embedding ?? [1, 0, 0],
  };
}
