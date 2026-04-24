import express from "express"
import cors from "cors"
import { pinoHttp } from "pino-http"
import { createExpressMiddleware } from "@trpc/server/adapters/express"
import { logger } from "@monark/common"
import { env } from "./lib/env"
import { appRouter } from "./trpc/router"
import { createContext } from "./trpc/context"

const app = express()

app.use(pinoHttp({ logger }))
app.use(
  cors({
    origin: (origin, callback) => {
      // allow tools / server-to-server calls with no Origin header
      if (!origin) return callback(null, true)
      if (env.WEB_ORIGIN.includes(origin)) return callback(null, true)
      return callback(new Error(`CORS: origin not allowed: ${origin}`))
    },
    credentials: true,
  }),
)
app.use(express.json())

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api" })
})

app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
)

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "api listening")
})
