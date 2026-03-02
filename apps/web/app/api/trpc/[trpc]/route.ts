import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@daemon/api";
import { createContext } from "@/src/server/trpc";
import { logError } from "@/src/server/logger";

const handler = async (req: Request) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext({ req, requestId }),
    onError({ path, error, type, req: request }) {
      const rid = request.headers.get("x-request-id") ?? requestId;
      logError("trpc.request.error", {
        request_id: rid,
        route: "/api/trpc",
        trpc_path: path ?? null,
        trpc_type: type,
        error_code: error.code,
        error_message: error.message,
      });
    },
  });
  response.headers.set("X-Request-Id", requestId);
  return response;
};

export const GET = handler;
export const POST = handler;
