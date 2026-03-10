import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createXai } from "@ai-sdk/xai";
import { createMistral } from "@ai-sdk/mistral";
import { streamText, generateText, embed } from "ai";
import type { LanguageModel, EmbeddingModel } from "ai";
import type {
  ChatMessageContent,
  LlmModelSelection,
  LlmPort,
  LlmProviderConfig,
} from "@daemon/domain";

export interface VercelLlmConfig {
  model: string;
  fallbackModel?: string;
  embeddingModel: string;
  apiKey?: string;
  baseURL?: string;
  providerName?: string;
  embeddingMode?: "remote" | "local";
  embeddingDimensions?: number;
  allowLocalEmbeddingFallback?: boolean;
  sdkProvider?: "openai" | "anthropic" | "google" | "deepseek" | "xai" | "mistral";
  temperature?: number;
}

/** Subset of StreamTextResult properties used by this adapter */
interface StreamResultSubset {
  textStream: AsyncIterable<string>;
  text?: string | PromiseLike<string>;
}

/** Subset of GenerateTextResult properties used by this adapter */
interface GenerateResultSubset {
  text: string;
}

/** Subset of EmbedResult properties used by this adapter */
interface EmbedResultSubset {
  embedding: number[];
}

/** SDK content part for multimodal messages */
type SdkContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: URL; mimeType?: string };

/** SDK message content (string or multimodal parts) */
type SdkContent = string | SdkContentPart[];

/** SDK message shape passed to streamText/generateText */
type SdkMessage = { role: "system" | "user" | "assistant"; content: SdkContent };

/** Provider union returned by createProviderFromConfig */
type AiProvider = ReturnType<typeof createProviderFromConfig>;

/** Callable provider interface for model creation */
interface CallableProvider {
  (modelId: string): LanguageModel;
  chat?: (modelId: string) => LanguageModel;
}

/** Provider that may expose embedding model factories */
interface EmbeddingCapableProvider {
  textEmbeddingModel?: (modelId: string) => EmbeddingModel;
  embedding?: (modelId: string) => EmbeddingModel;
}

type StreamTextFn = (input: {
  model: LanguageModel;
  messages: SdkMessage[];
  abortSignal?: unknown;
  temperature?: number;
}) => StreamResultSubset;

type GenerateTextFn = (input: {
  model: LanguageModel;
  messages: SdkMessage[];
  temperature?: number;
}) => Promise<GenerateResultSubset>;

type EmbedFn = (input: {
  model: EmbeddingModel;
  value: string;
}) => Promise<EmbedResultSubset>;

interface VercelLlmRuntimeDeps {
  streamTextImpl?: StreamTextFn;
  generateTextImpl?: GenerateTextFn;
  embedImpl?: EmbedFn;
}

const normalizeText = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, " ");

const fnv1a = (input: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
};

const toPositiveInt = (value: number | undefined, fallback: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
};

const readStreamResultText = async (result: StreamResultSubset): Promise<string> => {
  if (!result) return "";
  if (typeof result.text === "string") {
    return result.text;
  }
  if (result.text && typeof (result.text as PromiseLike<string>).then === "function") {
    try {
      const resolved = await result.text;
      return typeof resolved === "string" ? resolved : "";
    } catch {
      return "";
    }
  }
  return "";
};

export const createDeterministicLocalEmbedding = (text: string, dimensions = 1536): number[] => {
  const dim = toPositiveInt(dimensions, 1536);
  const vector = new Array<number>(dim).fill(0);
  const normalized = normalizeText(text);
  if (!normalized) {
    vector[0] = 1;
    return vector;
  }

  const tokens = normalized.split(" ");
  for (const token of tokens) {
    const hash = fnv1a(token);
    const index = hash % dim;
    vector[index] += 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm <= 0) {
    vector[0] = 1;
    return vector;
  }
  return vector.map((value) => Number((value / norm).toFixed(8)));
};

const toSdkContent = (content: ChatMessageContent): SdkContent => {
  if (typeof content === "string") return content;
  return content.map((part): SdkContentPart => {
    if (part.type === "text") return { type: "text" as const, text: part.text };
    return { type: "image" as const, image: new URL(part.url), mimeType: part.mimeType };
  });
};

const toSdkMessages = (
  messages: Array<{ role: "system" | "user" | "assistant"; content: ChatMessageContent }>,
): SdkMessage[] => messages.map((m) => ({ role: m.role, content: toSdkContent(m.content) }));

function createProviderFromConfig(config: VercelLlmConfig) {
  const opts = {
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
  };
  switch (config.sdkProvider) {
    case "anthropic":
      return createAnthropic(opts);
    case "google":
      return createGoogleGenerativeAI(opts);
    case "deepseek":
      return createDeepSeek(opts);
    case "xai":
      return createXai(opts);
    case "mistral":
      return createMistral(opts);
    case "openai":
    default:
      return createOpenAI({
        ...opts,
        ...(config.providerName ? { name: config.providerName } : {}),
      });
  }
}

function createChatModel(provider: AiProvider, modelId: string, sdkProvider?: string): LanguageModel {
  const p = provider as CallableProvider;
  // For OpenAI and OpenAI-compatible providers, explicitly use .chat()
  // to avoid the v5+ default Responses API behavior
  if ((!sdkProvider || sdkProvider === "openai") && p.chat) {
    return p.chat(modelId);
  }
  return p(modelId);
}

export function createVercelLlmAdapter(
  config: VercelLlmConfig,
  deps: VercelLlmRuntimeDeps = {},
): LlmPort {
  const streamTextImpl = (deps.streamTextImpl ?? streamText) as StreamTextFn;
  const generateTextImpl = (deps.generateTextImpl ?? generateText) as GenerateTextFn;
  const embedImpl = (deps.embedImpl ?? embed) as EmbedFn;
  const provider = createProviderFromConfig(config);

  const chatModel: LanguageModel = createChatModel(provider, config.model, config.sdkProvider);
  const fallbackChatModel: LanguageModel | null = config.fallbackModel
    ? createChatModel(provider, config.fallbackModel, config.sdkProvider)
    : null;
  const embeddingDimensions = toPositiveInt(config.embeddingDimensions, 1536);

  const resolveModel = (override?: string): { model: LanguageModel; name: string } => {
    if (override && override !== config.model) {
      return { model: createChatModel(provider, override, config.sdkProvider), name: override };
    }
    return { model: chatModel, name: config.model };
  };

  const resolveRemoteEmbedding = (): EmbeddingModel => {
    // Not all providers expose embedding factories on their type surface,
    // so we cast through unknown to access them at runtime.
    const p = provider as unknown as EmbeddingCapableProvider &
      ((modelId: string) => EmbeddingModel);
    return (
      p.textEmbeddingModel?.(config.embeddingModel) ??
      p.embedding?.(config.embeddingModel) ??
      p(config.embeddingModel)
    );
  };

  return {
    async *streamChat({ messages, model: modelOverride, onModelResolved, abortSignal }) {
      const sdkMessages = toSdkMessages(messages);
      const primary = resolveModel(modelOverride);
      let resolved = false;
      const reportResolved = (selection: LlmModelSelection) => {
        if (resolved) return;
        resolved = true;
        onModelResolved?.(selection);
      };

      let yielded = false;
      try {
        const primaryResult = streamTextImpl({
          model: primary.model,
          messages: sdkMessages,
          abortSignal,
          ...(config.temperature != null ? { temperature: config.temperature } : {}),
        });
        let primaryChunked = false;
        for await (const chunk of primaryResult.textStream) {
          if (!primaryChunked) {
            primaryChunked = true;
            reportResolved({ model: primary.name, route: "primary" });
          }
          yielded = true;
          yield chunk;
        }
        if (!primaryChunked) {
          const fullText = await readStreamResultText(primaryResult);
          if (fullText) {
            yielded = true;
            reportResolved({ model: primary.name, route: "primary" });
            yield fullText;
            return;
          }
          reportResolved({ model: primary.name, route: "primary" });
        }
        return;
      } catch (error) {
        if (!fallbackChatModel || yielded) {
          throw error;
        }
      }

      const fallbackResult = streamTextImpl({
        model: fallbackChatModel,
        messages: sdkMessages,
        abortSignal,
        ...(config.temperature != null ? { temperature: config.temperature } : {}),
      });
      let fallbackChunked = false;
      for await (const chunk of fallbackResult.textStream) {
        if (!fallbackChunked) {
          fallbackChunked = true;
          reportResolved({ model: config.fallbackModel ?? "", route: "fallback" });
        }
        yield chunk;
      }
      if (!fallbackChunked) {
        const fullText = await readStreamResultText(fallbackResult);
        if (fullText) {
          reportResolved({ model: config.fallbackModel ?? "", route: "fallback" });
          yield fullText;
          return;
        }
        reportResolved({ model: config.fallbackModel ?? "", route: "fallback" });
      }
    },

    async completeChat({ messages, model: modelOverride, onModelResolved }) {
      const sdkMessages = toSdkMessages(messages);
      const primary = resolveModel(modelOverride);
      try {
        const result = await generateTextImpl({
          model: primary.model,
          messages: sdkMessages,
          ...(config.temperature != null ? { temperature: config.temperature } : {}),
        });
        onModelResolved?.({ model: primary.name, route: "primary" });
        return result.text ?? "";
      } catch (error) {
        if (!fallbackChatModel) {
          throw error;
        }
      }

      const fallbackResult = await generateTextImpl({
        model: fallbackChatModel,
        messages: sdkMessages,
        ...(config.temperature != null ? { temperature: config.temperature } : {}),
      });
      onModelResolved?.({ model: config.fallbackModel ?? "", route: "fallback" });
      return fallbackResult.text ?? "";
    },

    async embed({ text }) {
      if (config.embeddingMode === "local") {
        return createDeterministicLocalEmbedding(text, embeddingDimensions);
      }

      try {
        const result = await embedImpl({
          model: resolveRemoteEmbedding(),
          value: text.trim(),
        });
        if (result.embedding && Array.isArray(result.embedding)) {
          return result.embedding;
        }
      } catch (error) {
        if (!config.allowLocalEmbeddingFallback) {
          throw error;
        }
      }
      if (config.allowLocalEmbeddingFallback) {
        return createDeterministicLocalEmbedding(text, embeddingDimensions);
      }
      return [];
    },
  };
}

/**
 * Create LlmPort dynamically from an Agent's llmProvider config.
 * Throws if the agent has no llmProvider configured.
 */
export function createLlmFromAgentConfig(
  provider: LlmProviderConfig | undefined,
  opts?: {
    embeddingMode?: "remote" | "local";
    allowLocalEmbeddingFallback?: boolean;
    embeddingDimensions?: number;
    temperature?: number;
  },
): LlmPort {
  if (!provider || !provider.apiKey || !provider.baseURL || !provider.model) {
    throw new Error("Agent 未配置 LLM Provider，请在 Agent 设置中配置 API Key、Base URL 和模型");
  }
  return createVercelLlmAdapter({
    model: provider.model,
    embeddingModel: "text-embedding-3-small",
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
    sdkProvider: provider.sdkProvider ?? "openai",
    temperature: opts?.temperature,
    embeddingMode: opts?.embeddingMode ?? "local",
    allowLocalEmbeddingFallback: opts?.allowLocalEmbeddingFallback ?? true,
    embeddingDimensions: opts?.embeddingDimensions ?? 1536,
  });
}
