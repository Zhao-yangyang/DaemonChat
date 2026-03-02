import type { Clock, LlmPort, MemoryStore, TranscriptStore } from "../container/types";
import type { MemoryItem, TranscriptEvent } from "../types";

type ExtractMemoryOptions = {
  scopeType: MemoryItem["scopeType"];
  scopeId: string;
  maxEvents?: number;
};

type ExtractedMemoryDraft = {
  type: MemoryItem["type"];
  content: string;
  tags: string[];
  sensitivity: MemoryItem["sensitivity"];
  contextEligible: boolean;
};

const toText = (event: TranscriptEvent): string => {
  const value = event.content?.text;
  return typeof value === "string" ? value.trim() : "";
};

const normalizeSensitivity = (value: unknown): MemoryItem["sensitivity"] => {
  if (value === "public" || value === "private" || value === "secret") return value;
  return "private";
};

const normalizeType = (value: unknown): MemoryItem["type"] | null => {
  if (value === "fact" || value === "rule" || value === "preference" || value === "task") {
    return value;
  }
  return null;
};

const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 8);
};

const extractJsonArray = (value: string): unknown[] => {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const candidates: string[] = [trimmed];

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    candidates.push(fenced[1].trim());
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // continue
    }
  }
  return [];
};

export function createMemoryExtractionService(ports: {
  transcripts: TranscriptStore;
  memory: MemoryStore;
  llm: LlmPort;
  clock: Clock;
}) {
  return {
    async extractMemoryFromSession(
      agentId: string,
      sessionId: string,
      options: ExtractMemoryOptions
    ): Promise<MemoryItem[]> {
      const maxEvents = options.maxEvents && options.maxEvents > 0 ? options.maxEvents : 80;
      const events = await ports.transcripts.listRecentEvents({
        agentId,
        sessionId,
        limit: Math.min(maxEvents, 200),
      });

      const transcriptLines = events
        .filter((event) => event.type === "user_message" || event.type === "assistant_message")
        .map((event) => {
          const text = toText(event);
          if (!text) return null;
          const speaker = event.type === "user_message" ? "user" : "assistant";
          return `${speaker}: ${text}`;
        })
        .filter((line): line is string => Boolean(line));

      if (transcriptLines.length === 0) {
        return [];
      }

      const extractionPrompt = [
        "从以下对话中提取可长期复用的记忆，返回 JSON 数组。",
        "每一项格式：",
        '{ "type": "fact|rule|preference|task", "content": "string", "tags": ["string"], "sensitivity": "public|private|secret", "contextEligible": true|false }',
        "仅输出 JSON，不要输出解释文字。",
        "",
        "对话：",
        transcriptLines.join("\n"),
      ].join("\n");

      const llmOutput = await ports.llm.completeChat({
        messages: [
          {
            role: "system",
            content: "你是结构化信息提取器。输出必须是合法 JSON 数组。",
          },
          { role: "user", content: extractionPrompt },
        ],
      });

      const parsed = extractJsonArray(llmOutput);
      const drafts: ExtractedMemoryDraft[] = parsed
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const record = item as Record<string, unknown>;
          const type = normalizeType(record.type);
          const content =
            typeof record.content === "string" ? record.content.trim() : "";
          if (!type || !content) return null;
          return {
            type,
            content,
            tags: normalizeTags(record.tags),
            sensitivity: normalizeSensitivity(record.sensitivity),
            contextEligible:
              typeof record.contextEligible === "boolean"
                ? record.contextEligible
                : true,
          };
        })
        .filter((item): item is ExtractedMemoryDraft => Boolean(item));

      const created: MemoryItem[] = [];
      for (const draft of drafts) {
        const embedding = await ports.llm.embed({ text: draft.content });
        const item = await ports.memory.insertMemoryItem({
          agentId,
          scopeType: options.scopeType,
          scopeId: options.scopeId,
          type: draft.type,
          content: draft.content,
          tags: draft.tags,
          sensitivity: draft.sensitivity,
          contextEligible: draft.contextEligible,
          embedding,
          now: ports.clock.now(),
        });
        created.push(item);
      }

      return created;
    },
  };
}

