import { describe, expect, test } from "bun:test";
import { createDeterministicLocalEmbedding, createVercelLlmAdapter } from "./index";

describe("local embedding helper", () => {
  test("returns stable embedding for same input", () => {
    const first = createDeterministicLocalEmbedding("Hello DeepSeek", 64);
    const second = createDeterministicLocalEmbedding("Hello DeepSeek", 64);

    expect(first).toEqual(second);
  });

  test("returns normalized vector with requested dimensions", () => {
    const vector = createDeterministicLocalEmbedding("token one token two", 128);

    expect(vector).toHaveLength(128);
    const l2 = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    expect(l2).toBeCloseTo(1, 5);
  });

  test("handles empty text with deterministic fallback vector", () => {
    const vector = createDeterministicLocalEmbedding("   ", 32);

    expect(vector).toHaveLength(32);
    expect(vector[0]).toBe(1);
    expect(vector.slice(1).every((value) => value === 0)).toBe(true);
  });
});

describe("adapter fallback routing", () => {
  test("completeChat retries with fallback model when primary fails", async () => {
    let calls = 0;
    let resolved: { model: string; route: "primary" | "fallback" } | undefined;
    const adapter = createVercelLlmAdapter(
      {
        model: "primary-model",
        fallbackModel: "fallback-model",
        embeddingModel: "embed-model",
      },
      {
        generateTextImpl: async () => {
          calls += 1;
          if (calls === 1) {
            throw new Error("primary unavailable");
          }
          return { text: "fallback ok" };
        },
      },
    );

    const text = await adapter.completeChat({
      messages: [{ role: "user", content: "hello" }],
      onModelResolved: (selection) => {
        resolved = selection;
      },
    });

    expect(text).toBe("fallback ok");
    expect(calls).toBe(2);
    if (!resolved) {
      throw new Error("expected resolved model selection");
    }
    const selected = resolved;
    expect(selected.model).toBe("fallback-model");
    expect(selected.route).toBe("fallback");
  });

  test("streamChat retries with fallback model when primary fails before first chunk", async () => {
    let calls = 0;
    let resolved: { model: string; route: "primary" | "fallback" } | undefined;
    const adapter = createVercelLlmAdapter(
      {
        model: "primary-model",
        fallbackModel: "fallback-model",
        embeddingModel: "embed-model",
      },
      {
        streamTextImpl: () => {
          calls += 1;
          if (calls === 1) {
            throw new Error("primary stream failed");
          }
          return {
            textStream: (async function* () {
              yield "fallback ";
              yield "stream";
            })(),
          };
        },
      },
    );

    let output = "";
    for await (const chunk of adapter.streamChat({
      messages: [{ role: "user", content: "hello" }],
      onModelResolved: (selection) => {
        resolved = selection;
      },
    })) {
      output += chunk;
    }

    expect(output).toBe("fallback stream");
    expect(calls).toBe(2);
    if (!resolved) {
      throw new Error("expected resolved model selection");
    }
    const selected = resolved;
    expect(selected.model).toBe("fallback-model");
    expect(selected.route).toBe("fallback");
  });

  test("streamChat reports primary model when fallback is not used", async () => {
    let resolved: { model: string; route: "primary" | "fallback" } | undefined;
    const adapter = createVercelLlmAdapter(
      {
        model: "primary-model",
        fallbackModel: "fallback-model",
        embeddingModel: "embed-model",
      },
      {
        streamTextImpl: () => ({
          textStream: (async function* () {
            yield "ok";
          })(),
        }),
      },
    );

    let output = "";
    for await (const chunk of adapter.streamChat({
      messages: [{ role: "user", content: "hello" }],
      onModelResolved: (selection) => {
        resolved = selection;
      },
    })) {
      output += chunk;
    }

    expect(output).toBe("ok");
    if (!resolved) {
      throw new Error("expected resolved model selection");
    }
    const selected = resolved;
    expect(selected.model).toBe("primary-model");
    expect(selected.route).toBe("primary");
  });

  test("streamChat falls back to final text when provider yields no chunks", async () => {
    let resolved: { model: string; route: "primary" | "fallback" } | undefined;
    const adapter = createVercelLlmAdapter(
      {
        model: "primary-model",
        fallbackModel: "fallback-model",
        embeddingModel: "embed-model",
      },
      {
        streamTextImpl: () => ({
          textStream: (async function* () {})(),
          text: Promise.resolve("final text"),
        }),
      },
    );

    let output = "";
    for await (const chunk of adapter.streamChat({
      messages: [{ role: "user", content: "hello" }],
      onModelResolved: (selection) => {
        resolved = selection;
      },
    })) {
      output += chunk;
    }

    expect(output).toBe("final text");
    if (!resolved) {
      throw new Error("expected resolved model selection");
    }
    const selected = resolved;
    expect(selected.model).toBe("primary-model");
    expect(selected.route).toBe("primary");
  });
});
