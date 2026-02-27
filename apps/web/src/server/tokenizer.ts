import { encodingForModel, getEncoding, type Tiktoken, type TiktokenModel } from "js-tiktoken";
import type { TokenizerPort } from "@daemon/domain";

const approxTokens = (text: string) => Math.ceil(text.length / 4);

export function createOpenAiTokenizerPort(defaultModel?: string): TokenizerPort {
  const cache = new Map<string, Tiktoken>();
  const fallbackKey = "__fallback_o200k_base";

  const resolveTokenizer = (model?: string): Tiktoken => {
    const key = model ?? defaultModel ?? fallbackKey;
    const cached = cache.get(key);
    if (cached) return cached;

    let tokenizer: Tiktoken | null = null;
    const candidate = model ?? defaultModel;
    if (candidate) {
      try {
        tokenizer = encodingForModel(candidate as TiktokenModel);
      } catch {
        tokenizer = null;
      }
    }
    if (!tokenizer) {
      tokenizer = getEncoding("o200k_base");
    }

    cache.set(key, tokenizer);
    return tokenizer;
  };

  return {
    countTokens({ text, model }) {
      try {
        return resolveTokenizer(model).encode(text).length;
      } catch {
        return approxTokens(text);
      }
    },
  };
}
