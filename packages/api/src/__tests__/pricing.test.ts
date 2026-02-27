import { describe, expect, test } from "bun:test";
import { resolveModelPricingFromEnv } from "../pricing";

describe("resolveModelPricingFromEnv", () => {
  test("reads per-model pricing from MODEL_PRICING_JSON", () => {
    const pricing = resolveModelPricingFromEnv("gpt-4o-mini", {
      MODEL_PRICING_JSON: JSON.stringify({
        "gpt-4o-mini": {
          inputPer1MUsd: 0.11,
          outputPer1MUsd: 0.44,
        },
      }),
    });

    expect(pricing).toEqual({
      inputPer1MUsd: 0.11,
      outputPer1MUsd: 0.44,
    });
  });

  test("falls back to OPENAI_*_PRICE_PER_1M when json mapping is absent", () => {
    const pricing = resolveModelPricingFromEnv("custom-model", {
      OPENAI_INPUT_PRICE_PER_1M: "0.25",
      OPENAI_OUTPUT_PRICE_PER_1M: "1.5",
    });

    expect(pricing).toEqual({
      inputPer1MUsd: 0.25,
      outputPer1MUsd: 1.5,
    });
  });

  test("uses built-in fallback for known models when env is empty", () => {
    const pricing = resolveModelPricingFromEnv("gpt-4o-mini", {});

    expect(pricing).toEqual({
      inputPer1MUsd: 0.15,
      outputPer1MUsd: 0.6,
    });
  });

  test("returns undefined for unknown model without usable env", () => {
    const pricing = resolveModelPricingFromEnv("unknown-model", {});

    expect(pricing).toBeUndefined();
  });
});
