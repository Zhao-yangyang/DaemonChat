import { createClient } from "@supabase/supabase-js";

// Lazy singleton — avoids Turbopack / Next 16 edge case where module-level
// process.env.NEXT_PUBLIC_* access is evaluated before the client bundle's
// env injection has run, resulting in empty strings and "Failed to fetch".
let _client: ReturnType<typeof createClient> | null = null;

function getSupabaseBrowserClient() {
  if (!_client) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    _client = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _client;
}

// Proxy that forwards every property access to the lazily-created client.
// This keeps the existing "import { supabaseBrowserClient } from ..." API
// intact across the codebase without any call-site changes.
export const supabaseBrowserClient = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    const client = getSupabaseBrowserClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
  set(_target, prop, value) {
    const client = getSupabaseBrowserClient();
    (client as unknown as Record<string | symbol, unknown>)[prop] = value;
    return true;
  },
});
