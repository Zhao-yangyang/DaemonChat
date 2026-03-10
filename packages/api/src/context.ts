import type { Services } from "@daemon/domain";

export interface ApiUser {
  id: string;
}

export interface ApiLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export interface ApiRequestMeta {
  requestId: string;
  route: string;
  startedAt: number;
  method?: string;
  path?: string;
  userAgent?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase client returns dynamic row shapes; strict generic typing is impractical here
export type SupabaseLike = { from(table: string): any; rpc?(fn: string, params?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown | null }> };

export interface ApiContext {
  user: ApiUser | null;
  container: Services;
  logger?: ApiLogger;
  requestMeta?: ApiRequestMeta;
  supabase?: SupabaseLike;
}

export function createContext(input: ApiContext): ApiContext {
  return input;
}
