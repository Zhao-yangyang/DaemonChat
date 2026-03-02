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

export interface SupabaseLike {
  from(table: string): any;
}

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
