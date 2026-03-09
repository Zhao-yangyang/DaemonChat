/// <reference types="bun-types" />
import { beforeEach, describe, expect, test } from "bun:test";
import { POST } from "./route";

const createRequest = (input: { body?: unknown; headers?: Record<string, string> } = {}) =>
  new Request("http://localhost/api/chat/stream/anonymous", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(input.headers ?? {}),
    },
    body:
      input.body === undefined
        ? undefined
        : typeof input.body === "string"
          ? input.body
          : JSON.stringify(input.body ?? {}),
  });

describe("anonymous chat route", () => {
  const placeholderEnv = {
    SUPABASE_URL: "https://placeholder.supabase.co",
    SUPABASE_ANON_KEY: "placeholder-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-key",
  };

  beforeEach(() => {
    Object.assign(process.env, placeholderEnv);
    process.env.ANONYMOUS_CHAT_ENABLED = "0";
  });

  test("returns 403 when ANONYMOUS_CHAT_ENABLED is false", async () => {
    process.env.ANONYMOUS_CHAT_ENABLED = "0";
    const res = await POST(
      createRequest({
        body: {
          agentId: "00000000-0000-0000-0000-000000000000",
          messages: [],
          userInput: "hi",
        },
      })
    );
    expect(res.status).toBe(403);
  });

  test("returns 400 when body is invalid", async () => {
    process.env.ANONYMOUS_CHAT_ENABLED = "1";
    const res = await POST(
      createRequest({
        body: { agentId: "x" },
      })
    );
    expect(res.status).toBe(400);
  });

  test("returns 400 when JSON is malformed", async () => {
    process.env.ANONYMOUS_CHAT_ENABLED = "1";
    const res = await POST(
      createRequest({
        body: "not json",
      })
    );
    expect(res.status).toBe(400);
  });

  test("returns 404 when agent not found with placeholder Supabase", async () => {
    process.env.ANONYMOUS_CHAT_ENABLED = "1";
    const res = await POST(
      createRequest({
        body: {
          agentId: "00000000-0000-0000-0000-000000000000",
          messages: [],
          userInput: "hello",
        },
      })
    );
    expect(res.status).toBe(404);
  });

  test("returns 429 when turn count exceeds max with placeholder Supabase", async () => {
    process.env.ANONYMOUS_CHAT_ENABLED = "1";
    process.env.ANONYMOUS_CHAT_MAX_TURNS = "2";
    const res = await POST(
      createRequest({
        body: {
          agentId: "00000000-0000-0000-0000-000000000000",
          messages: [
            { role: "user", content: "a" },
            { role: "assistant", content: "b" },
            { role: "user", content: "c" },
            { role: "assistant", content: "d" },
          ],
          userInput: "e",
        },
      })
    );
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe("max_turns_exceeded");
    expect(json.maxTurns).toBe(2);
  });

  test("returns 500 when SUPABASE_URL is missing", async () => {
    process.env.ANONYMOUS_CHAT_ENABLED = "1";
    process.env.SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    const res = await POST(
      createRequest({
        body: {
          agentId: "00000000-0000-0000-0000-000000000000",
          messages: [],
          userInput: "hi",
        },
      })
    );
    expect(res.status).toBe(500);
  });
});
