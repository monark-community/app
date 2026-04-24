import { FLAGS, type FlagKey } from "../contracts/index"
import { upsertFlagDefinition } from "./data"

export async function syncFlagsToDatabase(): Promise<void> {
  for (const [key, meta] of Object.entries(FLAGS) as Array<
    [FlagKey, { description: string; defaultOn: boolean }]
  >) {
    await upsertFlagDefinition(key, meta.description, meta.defaultOn)
  }
}
