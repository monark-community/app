import { NotFoundError } from "@monark/common";
import { findById, findByEmail, type UserRow } from "./data";

export type User = UserRow;

export async function getById(id: string): Promise<User | null> {
  return findById(id);
}

export async function getByIdOrThrow(id: string): Promise<User> {
  const user = await findById(id);
  if (!user) throw new NotFoundError("User", id);
  return user;
}

export async function getByEmail(email: string): Promise<User | null> {
  return findByEmail(email);
}

export async function getCurrent(ctx: { userId: string | null }): Promise<User | null> {
  if (!ctx.userId) return null;
  return findById(ctx.userId);
}
