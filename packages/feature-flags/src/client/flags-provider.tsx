"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { FlagKey } from "../contracts/index"

type FlagMap = Partial<Record<FlagKey, boolean>>

const FlagsContext = createContext<FlagMap>({})

export function FlagsProvider({
  flags,
  children,
}: {
  flags: FlagMap
  children: ReactNode
}) {
  return <FlagsContext.Provider value={flags}>{children}</FlagsContext.Provider>
}

export function useFlag(key: FlagKey): boolean {
  const flags = useContext(FlagsContext)
  return flags[key] ?? false
}

export function useFlags<K extends FlagKey>(keys: K[]): Record<K, boolean> {
  const flags = useContext(FlagsContext)
  const result = {} as Record<K, boolean>
  for (const key of keys) {
    result[key] = flags[key] ?? false
  }
  return result
}
