export interface ModelPricing {
  inputPer1MUsd: number;
  outputPer1MUsd: number;
}

type PricingEnv = Record<string, string | undefined>;

const FALLBACK_MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4o-mini": { inputPer1MUsd: 0.15, outputPer1MUsd: 0.6 },
  "gpt-4o": { inputPer1MUsd: 5, outputPer1MUsd: 15 },
};

const parseNumber = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
};

const parsePricingFromJson = (
  model: string,
  source: string | undefined
): ModelPricing | undefined => {
  if (!source) return undefined;
  try {
    const parsed = JSON.parse(source) as Record<
      string,
      { inputPer1MUsd?: unknown; outputPer1MUsd?: unknown }
    >;
    const candidate = parsed[model];
    if (!candidate) return undefined;
    const inputPer1MUsd = Number(candidate.inputPer1MUsd);
    const outputPer1MUsd = Number(candidate.outputPer1MUsd);
    if (
      !Number.isFinite(inputPer1MUsd) ||
      !Number.isFinite(outputPer1MUsd) ||
      inputPer1MUsd < 0 ||
      outputPer1MUsd < 0
    ) {
      return undefined;
    }
    return { inputPer1MUsd, outputPer1MUsd };
  } catch {
    return undefined;
  }
};

export function resolveModelPricingFromEnv(
  model: string,
  env: PricingEnv = process.env
): ModelPricing | undefined {
  const fromJson = parsePricingFromJson(model, env.MODEL_PRICING_JSON);
  if (fromJson) return fromJson;

  const inputPer1MUsd = parseNumber(env.OPENAI_INPUT_PRICE_PER_1M);
  const outputPer1MUsd = parseNumber(env.OPENAI_OUTPUT_PRICE_PER_1M);
  if (typeof inputPer1MUsd === "number" && typeof outputPer1MUsd === "number") {
    return { inputPer1MUsd, outputPer1MUsd };
  }

  return FALLBACK_MODEL_PRICING[model];
}
