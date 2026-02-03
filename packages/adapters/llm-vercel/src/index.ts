import { openai } from "@ai-sdk/openai";
import { streamText, generateText, embed } from "ai";
import type { LlmPort } from "@daemon/domain";

export interface VercelLlmConfig {
  model: string;
  embeddingModel: string;
}

export function createVercelLlmAdapter(config: VercelLlmConfig): LlmPort {
  const chatModel: any = (openai as any)(config.model);
  const embeddingModel: any =
    (openai as any).embedding?.(config.embeddingModel) ?? (openai as any)(config.embeddingModel);

  return {
    async *streamChat({ messages }) {
      const result: any = await streamText({
        model: chatModel,
        messages,
      });

      for await (const chunk of result.textStream) {
        yield chunk;
      }
    },

    async completeChat({ messages }) {
      const result: any = await generateText({
        model: chatModel,
        messages,
      });
      return result.text ?? "";
    },

    async embed({ text }) {
      const result: any = await embed({
        model: embeddingModel,
        value: text,
      });
      return result.embedding ?? [];
    },
  };
}
