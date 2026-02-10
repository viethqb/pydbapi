import { Outlet, useLocation, useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect } from "react"

import useAuth from "@/hooks/useAuth"
import { usePermissions } from "@/hooks/usePermissions"

/**
 * Path prefix -> at least one of these permissions (or menu:*) required to access.
 * Without permission, redirect to /.
 */
const PATH_PERMISSIONS: { prefix: string; exact?: boolean; permissions: string[] }[] = [
  { prefix: "/admin", permissions: ["users:read", "menu:admin"] },
  { prefix: "/connection", permissions: ["datasources:read", "menu:connection"] },
  { prefix: "/api-dev", permissions: ["modules:read", "api_assignments:read", "macro_defs:read", "menu:api_dev"] },
  { prefix: "/api-repository", permissions: ["overview:read", "menu:api_repository"] },
  { prefix: "/system", permissions: ["groups:read", "clients:read", "menu:system"] },
  { prefix: "/", exact: true, permissions: ["overview:read", "menu:dashboard", "dashboard:view"] },
  // /settings and /about have no matching entry = allow any logged-in user
]

function canAccessPath(
  pathname: string,
  checkPermission: (resource: string, action: string) => boolean,
): boolean {
  const normalized = pathname.replace(/\/$/, "") || "/"
  for (const { prefix, exact, permissions } of PATH_PERMISSIONS) {
    const match = exact
      ? normalized === prefix
      : normalized === prefix || normalized.startsWith(prefix + "/")
    if (match) {
      return permissions.some((p) => {
        const [resource, action] = p.split(":")
        return checkPermission(resource, action)
      })
    }
  }
  return true
}

export function RoutePermissionGuard() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { hasPermission } = usePermissions()

  const checkAccess = useCallback(
    (pathname: string) => canAccessPath(pathname, hasPermission),
    [hasPermission],
  )

  useEffect(() => {
    if (!user) return
    if (!checkAccess(location.pathname)) {
      navigate({ to: "/", replace: true })
    }
  }, [user, location.pathname, navigate, checkAccess])

  if (user && !checkAccess(location.pathname)) {
    return null
  }

  return <Outlet />
}
