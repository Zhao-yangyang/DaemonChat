import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@daemon/api";

export function createTrpcClient(options: {
  baseUrl: string;
  headers?: Record<string, string>;
}) {
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${options.baseUrl}/api/trpc`,
        headers: options.headers,
      }),
    ],
  });
}
