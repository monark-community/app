import { emit } from "@monark/common"
import { ValidationError } from "@monark/common"
import {
  FLAGS,
  isKnownFlag,
  type FlagFlippedEvent,
  type FlagKey,
  type FlagScope,
} from "../contracts/index"
import { writeOverride, deleteOverride } from "./data"

function assertValidScope(scope: FlagScope): void {
  const parts = [scope.organizationId, scope.userId, scope.role].filter(Boolean)
  if (parts.length > 1) {
    throw new ValidationError(
      "A feature flag override scope must target exactly one of organizationId, userId, or role (or none, for a global override).",
    )
  }
}

function assertKnownFlag(key: string): asserts key is FlagKey {
  if (!isKnownFlag(key)) {
    throw new ValidationError(`Unknown feature flag: ${key}`)
  }
}

export async function setOverride(
  key: string,
  scope: FlagScope,
  enabled: boolean,
  actorId: string,
  note?: string,
): Promise<void> {
  assertKnownFlag(key)
  assertValidScope(scope)

  // TODO: once @monark/rbac lands, guard this with requireRole("admin") on the caller context.
  if (!actorId) {
    throw new ValidationError("actorId is required to set a flag override.")
  }

  await writeOverride({ flagKey: key, scope, enabled, setById: actorId, note })

  const event: FlagFlippedEvent = {
    type: "feature-flag.flipped",
    flagKey: key,
    scope,
    enabled,
    actorId,
    occurredAt: new Date(),
  }
  await emit(event)
}

export async function removeOverride(id: string, actorId: string): Promise<void> {
  if (!actorId) {
    throw new ValidationError("actorId is required to remove a flag override.")
  }
  await deleteOverride(id)
}

export function listFlagDefinitions(): Array<{
  key: FlagKey
  description: string
  defaultOn: boolean
}> {
  return (Object.entries(FLAGS) as Array<
    [FlagKey, { description: string; defaultOn: boolean }]
  >).map(([key, meta]) => ({
    key,
    description: meta.description,
    defaultOn: meta.defaultOn,
  }))
}
