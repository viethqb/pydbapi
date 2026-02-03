import { createFileRoute, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const Route = createFileRoute("/_layout/admin")({
  component: AdminLayout,
  head: () => ({ meta: [{ title: "Admin" }] }),
})

function AdminLayout() {
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()

  const isRolesRoute =
    matchRoute({ to: "/admin/roles" }) ||
    matchRoute({ to: "/admin/roles/" }) ||
    matchRoute({ to: "/admin/roles/create" }) ||
    matchRoute({ to: "/admin/roles/$id" }) ||
    matchRoute({ to: "/admin/roles/$id/edit" })

  const activeTab = isRolesRoute ? "roles" : "users"

  const handleTabChange = (value: string) => {
    if (value === "roles") {
      navigate({ to: "/admin/roles" })
    } else {
      navigate({ to: "/admin/users" })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-muted-foreground">
          Manage users and roles
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>
      </Tabs>

      <Outlet />
    </div>
  )
}
