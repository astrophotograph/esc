"use client"

import type { ReactNode } from "react"
import { TelescopeProvider as OriginalTelescopeProvider, useTelescopeContext } from "../../context/TelescopeContext"

// Re-export the context hook with the name that's being imported elsewhere
export const useTelescope = useTelescopeContext

// Create a wrapper component that uses the original provider
export function TelescopeProvider({ children }: { children: ReactNode }) {
  return <OriginalTelescopeProvider>{children}</OriginalTelescopeProvider>
}

export default TelescopeProvider
