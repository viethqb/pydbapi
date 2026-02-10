import { useCallback, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"

import { UserPermissionsService } from "@/services/user-permissions"
import { isLoggedIn } from "@/hooks/useAuth"
import useAuth from "@/hooks/useAuth"

export type PermissionTuple = {
  resource_type: string
  action: string
  resource_id?: string | null
}

/**
 * Returns current user's permissions and a helper to check (resource_type, action, resource_id?).
 * Superuser is considered to have all permissions.
 *
 * For object-level: pass resourceId to check permission on a specific resource.
 * - resource_id=null in permission → all resources of that type
 * - resource_id=<uuid> in permission → only that resource
 */
export function usePermissions() {
  const { user } = useAuth()
  const isSuperuser = Boolean(user?.is_superuser)

  const { data, isLoading } = useQuery({
    queryKey: ["myPermissions"],
    queryFn: ({ signal }) => UserPermissionsService.getMyPermissions({ signal }),
    enabled: isLoggedIn() && !isSuperuser,
  })

  const permissions: PermissionTuple[] = useMemo(
    () =>
      isSuperuser
        ? []
        : (data?.data ?? []).map((p) => ({
            resource_type: p.resource_type,
            action: p.action,
            resource_id: p.resource_id ?? null,
          })),
    [isSuperuser, data],
  )

  const hasPermission = useCallback(
    (
      resourceType: string,
      action: string,
      resourceId?: string | null,
    ): boolean => {
      if (isSuperuser) return true
      return permissions.some((p) => {
        if (p.resource_type !== resourceType || p.action !== action) return false
        const permResourceId = p.resource_id ?? null
        if (resourceId == null || resourceId === "") {
          return true // caller doesn't care about specific resource
        }
        if (permResourceId == null) return true // perm is "all"
        return permResourceId === resourceId
      })
    },
    [isSuperuser, permissions],
  )

  return {
    permissions,
    hasPermission,
    isLoading: !isSuperuser && isLoading,
  }
}
