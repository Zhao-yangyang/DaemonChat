import type { Services } from "@daemon/domain";

export interface ApiUser {
  id: string;
}

export interface ApiContext {
  user: ApiUser | null;
  container: Services;
}

export function createContext(input: ApiContext): ApiContext {
  return input;
}
