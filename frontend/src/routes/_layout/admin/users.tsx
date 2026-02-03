import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Shield } from "lucide-react"
import { Suspense } from "react"

import { type UserPublic, UsersService } from "@/client"
import AddUser from "@/components/Admin/AddUser"
import { columns, type UserTableData } from "@/components/Admin/columns"
import { DataTable } from "@/components/Common/DataTable"
import PendingUsers from "@/components/Pending/PendingUsers"
import { Button } from "@/components/ui/button"
import useAuth from "@/hooks/useAuth"
import { usePermissions } from "@/hooks/usePermissions"

function getUsersQueryOptions() {
  return {
    queryFn: () => UsersService.readUsers({ skip: 0, limit: 100 }),
    queryKey: ["users"],
  }
}

export const Route = createFileRoute("/_layout/admin/users")({
  component: AdminUsersPage,
  head: () => ({
    meta: [{ title: "Users - Admin" }],
  }),
})

function UsersTableContent() {
  const { user: currentUser } = useAuth()
  const { hasPermission } = usePermissions()
  const { data: users } = useSuspenseQuery(getUsersQueryOptions())

  const tableData: UserTableData[] = users.data.map((user: UserPublic) => ({
    ...user,
    isCurrentUser: currentUser?.id === user.id,
    canUpdate: hasPermission("user", "update", user.id),
    canDelete: hasPermission("user", "delete", user.id),
  }))

  return <DataTable columns={columns} data={tableData} />
}

function UsersTable() {
  return (
    <Suspense fallback={<PendingUsers />}>
      <UsersTableContent />
    </Suspense>
  )
}

function AdminUsersPage() {
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission("user", "create")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground">
            Manage user accounts and permissions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/admin/roles">
            <Button variant="outline">
              <Shield className="mr-2 h-4 w-4" />
              Manage Roles
            </Button>
          </Link>
          {canCreate && <AddUser />}
        </div>
      </div>
      <UsersTable />
    </div>
  )
}
