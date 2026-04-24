import { getDb, type Prisma } from "@monark/db"

export type UserRow = Prisma.UserGetPayload<Record<string, never>>

export async function findById(id: string): Promise<UserRow | null> {
  const db = getDb()
  return db.user.findUnique({ where: { id } })
}

export async function findByEmail(email: string): Promise<UserRow | null> {
  const db = getDb()
  return db.user.findUnique({ where: { email } })
}

export async function updateProfileData(
  id: string,
  patch: {
    displayName?: string | null
    avatarUrl?: string | null
    localePreference?: string
  },
): Promise<UserRow> {
  const db = getDb()
  return db.user.update({ where: { id }, data: patch })
}
