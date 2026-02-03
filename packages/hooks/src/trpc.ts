import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@daemon/api";

export const trpc = createTRPCReact<AppRouter>();
