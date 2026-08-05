import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../api/src/trpc/router";

export const trpc = createTRPCReact<AppRouter>();

// Re-exported so client components can infer input/output types without
// re-deriving the (deep) relative path to the api router.
export type { AppRouter };
