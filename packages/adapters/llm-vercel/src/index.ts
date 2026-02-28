import { createOpenAI, openai } from "@ai-sdk/openai";
import { streamText, generateText, embed } from "ai";
import type { LlmModelSelection, LlmPort } from "@daemon/domain";

export interface VercelLlmConfig {
  model: string;
  fallbackModel?: string;
  embeddingModel: string;
  apiKey?: string;
  baseURL?: string;
  providerName?: string;
  compatibility?: "strict" | "compatible";
  embeddingMode?: "remote" | "local";
  embeddingDimensions?: number;
  allowLocalEmbeddingFallback?: boolean;
}

interface VercelLlmRuntimeDeps {
  streamTextImpl?: (input: any) => Promise<any>;
  generateTextImpl?: (input: any) => Promise<any>;
  embedImpl?: (input: any) => Promise<any>;
}

const normalizeText = (text: string): string =>
  text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const fnv1a = (input: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }
  return hash >>> 0;
};

const toPositiveInt = (value: number | undefined, fallback: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
};

const readStreamResultText = async (result: any): Promise<string> => {
  if (!result) return "";
  if (typeof result.text === "string") {
    return result.text;
  }
  if (result.text && typeof result.text.then === "function") {
    try {
      const resolved = await result.text;
      return typeof resolved === "string" ? resolved : "";
    } catch {
      return "";
    }
  }
  return "";
};

export const createDeterministicLocalEmbedding = (
  text: string,
  dimensions = 1536
): number[] => {
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

export function createVercelLlmAdapter(
  config: VercelLlmConfig,
  deps: VercelLlmRuntimeDeps = {}
): LlmPort {
  const streamTextImpl = deps.streamTextImpl ?? streamText;
  const generateTextImpl = deps.generateTextImpl ?? generateText;
  const embedImpl = deps.embedImpl ?? embed;
  const provider =
    config.baseURL || config.apiKey || config.providerName || config.compatibility
      ? createOpenAI({
          baseURL: config.baseURL,
          apiKey: config.apiKey,
          name: config.providerName,
          compatibility: config.compatibility ?? "compatible",
        })
      : openai;

  const chatModel: any = (provider as any)(config.model);
  const fallbackChatModel: any = config.fallbackModel
    ? (provider as any)(config.fallbackModel)
    : null;
  const embeddingDimensions = toPositiveInt(config.embeddingDimensions, 1536);

  const resolveRemoteEmbedding = () =>
    (provider as any).embedding?.(config.embeddingModel) ??
    (provider as any)(config.embeddingModel);

  return {
    async *streamChat({ messages, onModelResolved }) {
      let resolved = false;
      const reportResolved = (selection: LlmModelSelection) => {
        if (resolved) return;
        resolved = true;
        onModelResolved?.(selection);
      };

      let yielded = false;
      try {
        const primaryResult: any = await streamTextImpl({
          model: chatModel,
          messages,
        });
        let primaryChunked = false;
        for await (const chunk of primaryResult.textStream) {
          if (!primaryChunked) {
            primaryChunked = true;
            reportResolved({ model: config.model, route: "primary" });
          }
          yielded = true;
          yield chunk;
        }
        if (!primaryChunked) {
          const fullText = await readStreamResultText(primaryResult);
          if (fullText) {
            yielded = true;
            reportResolved({ model: config.model, route: "primary" });
            yield fullText;
            return;
          }
          reportResolved({ model: config.model, route: "primary" });
        }
        return;
      } catch (error) {
        if (!fallbackChatModel || yielded) {
          throw error;
        }
      }

      const fallbackResult: any = await streamTextImpl({
        model: fallbackChatModel,
        messages,
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

    async completeChat({ messages, onModelResolved }) {
      try {
        const result: any = await generateTextImpl({
          model: chatModel,
          messages,
        });
        onModelResolved?.({ model: config.model, route: "primary" });
        return result.text ?? "";
      } catch (error) {
        if (!fallbackChatModel) {
          throw error;
        }
      }

      const fallbackResult: any = await generateTextImpl({
        model: fallbackChatModel,
        messages,
      });
      onModelResolved?.({ model: config.fallbackModel ?? "", route: "fallback" });
      return fallbackResult.text ?? "";
    },

    async embed({ text }) {
      if (config.embeddingMode === "local") {
        return createDeterministicLocalEmbedding(text, embeddingDimensions);
      }

      try {
        const result: any = await embedImpl({
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
