export {
  PrismaClient,
  NotificationCategory,
  NotificationChannel,
  DataRecordScopeVerb,
} from "@prisma/client";
// `Prisma` is exported as a value (not just a type) so consumers can reach its
// runtime helpers — `Prisma.sql` / `Prisma.join` / `Prisma.empty` for tagged
// raw queries — as well as its type namespace (`Prisma.DataRecordWhereInput`).
export { Prisma } from "@prisma/client";
export { trigramMatch, trigramOrder, TRIGRAM_THRESHOLD } from "./trigram";

import { PrismaClient } from "@prisma/client";

let client: PrismaClient | undefined;

export function getDb(): PrismaClient {
  if (!client) {
    client = new PrismaClient();
  }
  return client;
}
