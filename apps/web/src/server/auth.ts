import type { ApiUser } from "@daemon/api";
import { createClient } from "@supabase/supabase-js";

type UserLookupResult = {
  data: { user: { id: string } | null };
  error: unknown | null;
};

type UserLookupClient = {
  auth: {
    getUser: (accessToken: string) => Promise<UserLookupResult>;
  };
};

type UserLookupClientFactory = (input: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  accessToken: string;
}) => UserLookupClient;

const defaultCreateUserLookupClient: UserLookupClientFactory = ({
  supabaseUrl,
  supabaseAnonKey,
  accessToken,
}) =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  }) as unknown as UserLookupClient;

export async function resolveApiUserFromAccessToken(input: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  accessToken: string | null;
  createClient?: UserLookupClientFactory;
}): Promise<ApiUser | null> {
  if (!input.accessToken) {
    return null;
  }

  const createClient = input.createClient ?? defaultCreateUserLookupClient;
  const client = createClient({
    supabaseUrl: input.supabaseUrl,
    supabaseAnonKey: input.supabaseAnonKey,
    accessToken: input.accessToken,
  });

  const { data, error } = await client.auth.getUser(input.accessToken);
  if (error || !data.user) {
    return null;
  }

  return { id: data.user.id };
}
