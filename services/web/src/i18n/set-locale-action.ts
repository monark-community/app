"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { isLocale, type Locale } from "./config"

const ONE_YEAR = 60 * 60 * 24 * 365

export async function setLocaleAction(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return
  const cookieStore = await cookies()
  cookieStore.set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  })
  revalidatePath("/", "layout")
}
