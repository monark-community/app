export { PrismaClient, Role } from "@prisma/client"
export type { Prisma } from "@prisma/client"

import { PrismaClient } from "@prisma/client"

let client: PrismaClient | undefined

export function getDb(): PrismaClient {
  if (!client) {
    client = new PrismaClient()
  }
  return client
}
