import { emit, ValidationError } from "@monark/common"
import {
  isKnownFlag,
  listFlagDescriptors,
  parseFlagKey,
  type FlagFlippedEvent,
  type FlagScope,
} from "../contracts/index"
import { writeOverride, deleteOverride } from "./data"

function assertValidScope(scope: FlagScope): void {
  const parts = [scope.organizationId, scope.userId, scope.roleId].filter(
    Boolean,
  )
  if (parts.length > 1) {
    throw new ValidationError(
      "A feature flag override scope must target exactly one of organizationId, userId, or roleId (or none, for a global override).",
    )
  }
}

function assertKnownFlag(
  dotted: string,
): { module: string; key: string } {
  if (!isKnownFlag(dotted)) {
    throw new ValidationError(`Unknown feature flag : ${dotted}`)
  }
  // isKnownFlag already validated parsability, so this is non-null.
  return parseFlagKey(dotted)!
}

export async function setOverride(
  dottedKey: string,
  scope: FlagScope,
  enabled: boolean,
  actorId: string,
  note?: string,
): Promise<void> {
  const ref = assertKnownFlag(dottedKey)
  assertValidScope(scope)

  if (!actorId) {
    throw new ValidationError("actorId is required to set a flag override.")
  }

  await writeOverride({
    module: ref.module,
    flagKey: ref.key,
    scope,
    enabled,
    setById: actorId,
    note,
  })

  const event: FlagFlippedEvent = {
    type: "feature-flag.flipped",
    module: ref.module,
    flagKey: ref.key,
    scope,
    enabled,
    actorId,
    occurredAt: new Date(),
  }
  await emit(event)
}

export async function removeOverride(
  id: string,
  actorId: string,
): Promise<void> {
  if (!actorId) {
    throw new ValidationError("actorId is required to remove a flag override.")
  }
  await deleteOverride(id)
}

export function listFlagDefinitions(): Array<{
  key: string
  module: string
  description: string
  defaultOn: boolean
}> {
  return listFlagDescriptors().map((d) => ({
    key: `${d.module}.${d.key}`,
    module: d.module,
    description: d.description,
    defaultOn: d.defaultOn,
  }))
}
