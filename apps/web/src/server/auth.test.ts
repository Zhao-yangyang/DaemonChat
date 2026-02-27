import { describe, expect, test } from "bun:test";
import { resolveApiUserFromAccessToken } from "./auth";

describe("resolveApiUserFromAccessToken", () => {
  test("returns null when access token is missing", async () => {
    let called = false;

    const user = await resolveApiUserFromAccessToken({
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "anon-key",
      accessToken: null,
      createClient: () => {
        called = true;
        return {
          auth: {
            getUser: async () => ({
              data: { user: { id: "user-1" } },
              error: null,
            }),
          },
        };
      },
    });

    expect(user).toBeNull();
    expect(called).toBe(false);
  });

  test("returns user id from verified access token", async () => {
    const user = await resolveApiUserFromAccessToken({
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "anon-key",
      accessToken: "token",
      createClient: () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user-123" } },
            error: null,
          }),
        },
      }),
    });

    expect(user).toEqual({ id: "user-123" });
  });

  test("returns null when token verification fails", async () => {
    const user = await resolveApiUserFromAccessToken({
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "anon-key",
      accessToken: "invalid",
      createClient: () => ({
        auth: {
          getUser: async () => ({
            data: { user: null },
            error: { message: "invalid token" },
          }),
        },
      }),
    });

    expect(user).toBeNull();
  });
});
