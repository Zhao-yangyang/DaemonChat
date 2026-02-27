import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@daemon/api";
import { createContext } from "@/src/server/trpc";
import { logError } from "@/src/server/logger";

const withRequestIdHeader = (req: Request): { request: Request; requestId: string } => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const headers = new Headers(req.headers);
  headers.set("x-request-id", requestId);
  return {
    request: new Request(req, { headers }),
    requestId,
  };
};

const handler = async (req: Request) => {
  const { request, requestId } = withRequestIdHeader(req);
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () => createContext({ req: request }),
    onError({ path, error, type, req: request }) {
      const requestId = request.headers.get("x-request-id") ?? null;
      logError("trpc.request.error", {
        request_id: requestId,
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
