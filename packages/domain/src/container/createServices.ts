import type { Ports, Services } from "./types";
import { createAgentService } from "../usecases/agent";
import { createSessionService } from "../usecases/session";
import { createTranscriptService } from "../usecases/transcript";
import { createMemoryService } from "../usecases/memory";
import { createCompactionService } from "../usecases/compaction";
import { createChatService } from "../usecases/chat";

export function createServices(ports: Ports): Services {
  return {
    ports,
    agent: createAgentService({ agents: ports.agents, clock: ports.clock }),
    session: createSessionService({ sessions: ports.sessions, clock: ports.clock }),
    transcript: createTranscriptService({ transcripts: ports.transcripts }),
    memory: createMemoryService({ memory: ports.memory, llm: ports.llm, clock: ports.clock }),
    compaction: createCompactionService({
      transcripts: ports.transcripts,
      llm: ports.llm,
      clock: ports.clock,
    }),
    chat: createChatService({
      sessions: ports.sessions,
      transcripts: ports.transcripts,
      memory: ports.memory,
      usage: ports.usage,
      llm: ports.llm,
      clock: ports.clock,
    }),
  };
}
