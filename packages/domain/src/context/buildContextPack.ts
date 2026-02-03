import type {
  ContextBudget,
  ContextMessage,
  ContextPack,
  MemoryItem,
  TranscriptEvent,
} from "../types";

const defaultApproxTokens = (text: string): number => Math.ceil(text.length / 4);

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

  messages.push({ role: "user", content: input.userInput });

  return messages;
};

const estimateTokens = (messages: ContextMessage[], approxTokens: (text: string) => number): number =>
  messages.reduce((sum, message) => sum + approxTokens(message.content), 0);

export function buildContextPack(input: {
  system: string;
  constraints: string[];
  taskState: string | null;
  memoryItems: MemoryItem[];
  recentMessages: TranscriptEvent[];
  userInput: string;
  budget: ContextBudget;
  approxTokens?: (text: string) => number;
}): ContextPack {
  const approxTokens = input.approxTokens ?? defaultApproxTokens;
  const maxContextTokens =
    input.budget.modelWindow -
    input.budget.reserveOutputTokens -
    input.budget.reserveToolTokens;

  let memoryTopK = input.memoryItems.slice(0, input.budget.memoryTopK);
  let recentMessages = input.recentMessages.slice(-input.budget.recentMessages);

  let trimmedMemory = false;
  let trimmedRecent = false;

  let messages = buildMessages({
    system: input.system,
    constraints: input.constraints,
    taskState: input.taskState,
    memoryItems: memoryTopK,
    recentMessages,
    userInput: input.userInput,
  });

  let tokenEstimate = estimateTokens(messages, approxTokens);

  while (recentMessages.length > 0 && tokenEstimate > maxContextTokens) {
    recentMessages = recentMessages.slice(1);
    trimmedRecent = true;
    messages = buildMessages({
      system: input.system,
      constraints: input.constraints,
      taskState: input.taskState,
      memoryItems: memoryTopK,
      recentMessages,
      userInput: input.userInput,
    });
    tokenEstimate = estimateTokens(messages, approxTokens);
  }

  while (memoryTopK.length > 0 && tokenEstimate > maxContextTokens) {
    memoryTopK = memoryTopK.slice(0, -1);
    trimmedMemory = true;
    messages = buildMessages({
      system: input.system,
      constraints: input.constraints,
      taskState: input.taskState,
      memoryItems: memoryTopK,
      recentMessages,
      userInput: input.userInput,
    });
    tokenEstimate = estimateTokens(messages, approxTokens);
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
