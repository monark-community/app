import { createTRPCReact } from "@trpc/react-query"
import type { AppRouter } from "../../../api/src/trpc/router.js"

export const trpc = createTRPCReact<AppRouter>()
