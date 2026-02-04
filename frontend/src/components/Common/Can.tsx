import type { ReactNode } from "react"

import useAuth from "@/hooks/useAuth"

interface CanProps {
  permission: string
  children: ReactNode
}

/**
 * Renders children only when the current user has the given permission
 * (or is superuser). Use for hiding Create/Edit/Delete buttons etc.
 */
export function Can({ permission, children }: CanProps) {
  const { hasPermission } = useAuth()
  if (!hasPermission(permission)) return null
  return <>{children}</>
}

export default Can
