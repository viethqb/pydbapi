import type { ReactNode } from "react"

import { usePermissions } from "@/hooks/usePermissions"

interface CanProps {
  permission: string
  children: ReactNode
}

/**
 * Renders children only when the current user has the given permission
 * (or is superuser). Use for hiding Create/Edit/Delete buttons etc.
 *
 * @param permission — colon-separated string, e.g. "users:read"
 */
export function Can({ permission, children }: CanProps) {
  const { hasPermission } = usePermissions()
  const [resource, action] = permission.split(":")
  if (!hasPermission(resource, action)) return null
  return <>{children}</>
}

export default Can
