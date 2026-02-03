import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@daemon/api";
import { createContext } from "@/src/server/trpc";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext({ req }),
  });

export const GET = handler;
export const POST = handler;
