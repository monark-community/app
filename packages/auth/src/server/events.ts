import { emit } from "@monark/common";
import type {
  UserSignedInEvent,
  UserSignedOutEvent,
  PasswordChangedEvent,
} from "../contracts/events";

export async function emitSignedIn(input: {
  userId: string;
  trustedDeviceId?: string;
}): Promise<void> {
  const event: UserSignedInEvent = {
    type: "user.signed-in",
    userId: input.userId,
    trustedDeviceId: input.trustedDeviceId,
    occurredAt: new Date(),
  };
  await emit(event);
}

export async function emitSignedOut(input: {
  userId: string;
  scope: "local" | "global";
}): Promise<void> {
  const event: UserSignedOutEvent = {
    type: "user.signed-out",
    userId: input.userId,
    scope: input.scope,
    occurredAt: new Date(),
  };
  await emit(event);
}

export async function emitPasswordChanged(input: {
  userId: string;
  triggeredBy: "user" | "reset";
}): Promise<void> {
  const event: PasswordChangedEvent = {
    type: "user.password-changed",
    userId: input.userId,
    triggeredBy: input.triggeredBy,
    occurredAt: new Date(),
  };
  await emit(event);
}
