import type {
  ContextBudget,
  ContextContentPart,
  ContextMessage,
  ContextPack,
  MemoryItem,
  TranscriptEvent,
} from "../types";

const defaultCountTokens = (input: { text: string }): number =>
  Math.ceil(input.text.length / 4);

const contentFromEvent = (event: TranscriptEvent): string => {
  if (typeof event.content === "string") {
    return event.content;
  }
  if (typeof event.content === "object" && event.content !== null) {
    const value = (event.content as { text?: string }).text;
    if (typeof value === "string") {
      return value;
    }
  }
  return JSON.stringify(event.content);
};

const buildMemoryMessage = (items: MemoryItem[]): string | null => {
  if (items.length === 0) return null;
  const lines = items.map((item) => `- ${item.content}`);
  return `Memory:\n${lines.join("\n")}`;
};

const buildConstraintsMessage = (constraints: string[]): string | null => {
  if (constraints.length === 0) return null;
  const lines = constraints.map((item) => `- ${item}`);
  return `Constraints:\n${lines.join("\n")}`;
};

const buildTaskStateMessage = (taskState: string | null): string | null => {
  if (!taskState) return null;
  return `Task State:\n${taskState}`;
};

const eventToMessage = (event: TranscriptEvent): ContextMessage | null => {
  const content = contentFromEvent(event);
  if (event.type === "user_message") {
    return { role: "user", content };
  }
  if (event.type === "assistant_message") {
    return { role: "assistant", content };
  }
  if (event.type === "system") {
    return { role: "system", content };
  }
  return null;
};

const buildMessages = (input: {
  system: string;
  constraints: string[];
  taskState: string | null;
  memoryItems: MemoryItem[];
  recentMessages: TranscriptEvent[];
  userInput: string;
  imageUrls?: Array<{ url: string; mimeType?: string }>;
}): ContextMessage[] => {
  const messages: ContextMessage[] = [];

  messages.push({ role: "system", content: input.system });

  const constraintsMessage = buildConstraintsMessage(input.constraints);
  if (constraintsMessage) {
    messages.push({ role: "system", content: constraintsMessage });
  }

  const taskStateMessage = buildTaskStateMessage(input.taskState);
  if (taskStateMessage) {
    messages.push({ role: "system", content: taskStateMessage });
  }

  const memoryMessage = buildMemoryMessage(input.memoryItems);
  if (memoryMessage) {
    messages.push({ role: "system", content: memoryMessage });
  }

  for (const event of input.recentMessages) {
    const message = eventToMessage(event);
    if (message) {
      messages.push(message);
    }
  }

  if (input.imageUrls && input.imageUrls.length > 0) {
    const parts: ContextContentPart[] = [{ type: "text", text: input.userInput }];
    for (const img of input.imageUrls) {
      parts.push({ type: "image", url: img.url, mimeType: img.mimeType });
    }
    messages.push({ role: "user", content: parts });
  } else {
    messages.push({ role: "user", content: input.userInput });
  }

  return messages;
};

const contentToText = (content: string | ContextContentPart[]): string => {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
};

const IMAGE_TOKEN_ESTIMATE = 765;

const estimateTokens = (
  messages: ContextMessage[],
  model: string | undefined,
  countTokens: (input: { text: string; model?: string }) => number
): number =>
  messages.reduce((sum, message) => {
    const textTokens = countTokens({ text: contentToText(message.content), model });
    const imageCount = Array.isArray(message.content)
      ? message.content.filter((p) => p.type === "image").length
      : 0;
    return sum + textTokens + imageCount * IMAGE_TOKEN_ESTIMATE;
  }, 0);

export function buildContextPack(input: {
  system: string;
  constraints: string[];
  taskState: string | null;
  memoryItems: MemoryItem[];
  recentMessages: TranscriptEvent[];
  userInput: string;
  imageUrls?: Array<{ url: string; mimeType?: string }>;
  model?: string;
  budget: ContextBudget;
  countTokens?: (input: { text: string; model?: string }) => number;
}): ContextPack {
  const countTokens = input.countTokens ?? defaultCountTokens;
  const maxContextTokens =
    input.budget.modelWindow -
    input.budget.reserveOutputTokens -
    input.budget.reserveToolTokens;

  let memoryTopK = input.memoryItems.slice(0, input.budget.memoryTopK);
  let recentMessages = input.recentMessages.slice(-input.budget.recentMessages);

  let trimmedMemory = false;
  let trimmedRecent = false;

  const buildMsgArgs = () => ({
    system: input.system,
    constraints: input.constraints,
    taskState: input.taskState,
    memoryItems: memoryTopK,
    recentMessages,
    userInput: input.userInput,
    imageUrls: input.imageUrls,
  });

  let messages = buildMessages(buildMsgArgs());

  let tokenEstimate = estimateTokens(messages, input.model, countTokens);

  while (recentMessages.length > 0 && tokenEstimate > maxContextTokens) {
    recentMessages = recentMessages.slice(1);
    trimmedRecent = true;
    messages = buildMessages(buildMsgArgs());
    tokenEstimate = estimateTokens(messages, input.model, countTokens);
  }

  while (memoryTopK.length > 0 && tokenEstimate > maxContextTokens) {
    memoryTopK = memoryTopK.slice(0, -1);
    trimmedMemory = true;
    messages = buildMessages(buildMsgArgs());
    tokenEstimate = estimateTokens(messages, input.model, countTokens);
  }

  const shouldCompact = tokenEstimate > maxContextTokens;

  return {
    system: input.system,
    constraints: input.constraints,
    taskState: input.taskState,
    memoryTopK,
    recentMessages,
    userInput: input.userInput,
    messages,
    maxContextTokens,
    tokenEstimate,
    trimmed: { memory: trimmedMemory, recent: trimmedRecent },
    shouldCompact,
  };
}
