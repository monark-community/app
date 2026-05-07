import { listFlagDescriptors } from "../contracts/index"
import { upsertFlagDefinition } from "./data"

export async function syncFlagsToDatabase(): Promise<void> {
  for (const desc of listFlagDescriptors()) {
    await upsertFlagDefinition(
      desc.module,
      desc.key,
      desc.description,
      desc.defaultOn,
    )
  }
}
