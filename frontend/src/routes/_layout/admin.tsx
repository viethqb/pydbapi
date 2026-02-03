import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/admin")({
  component: AdminLayout,
  head: () => ({ meta: [{ title: "Admin" }] }),
})

function AdminLayout() {
  const location = useLocation()
  const path = location.pathname

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 border-b pb-3">
        <Link
          to="/admin/users"
          className={`text-sm font-medium transition-colors hover:text-primary ${
            path === "/admin/users" || path.startsWith("/admin/users")
              ? "text-primary"
              : "text-muted-foreground"
          }`}
        >
          Users
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link
          to="/admin/roles"
          className={`text-sm font-medium transition-colors hover:text-primary ${
            path === "/admin/roles" || path.startsWith("/admin/roles")
              ? "text-primary"
              : "text-muted-foreground"
          }`}
        >
          Roles
        </Link>
      </div>
      <Outlet />
    </div>
  )
}
