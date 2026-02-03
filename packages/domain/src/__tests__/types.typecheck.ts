import type { Agent, Session, TranscriptEvent, MemoryItem } from "../types";

export function acceptAgent(agent: Agent): Agent {
  return agent;
}

export function acceptSession(session: Session): Session {
  return session;
}

export function acceptTranscript(event: TranscriptEvent): TranscriptEvent {
  return event;
}

export function acceptMemory(item: MemoryItem): MemoryItem {
  return item;
}
