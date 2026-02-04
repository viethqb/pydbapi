import { useSuspenseQuery } from "@tanstack/react-query"
import { Suspense } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { DataTable } from "@/components/Common/DataTable"
import PendingUsers from "@/components/Pending/PendingUsers"
import { RolesService } from "@/services/roles"
import { roleColumns } from "./roleColumns"

function getRolesQueryOptions() {
  return {
    queryFn: () => RolesService.list(),
    queryKey: ["roles"],
  }
}

function RolesTableContent() {
  const { data: roles } = useSuspenseQuery(getRolesQueryOptions())
  return <DataTable columns={roleColumns} data={roles.data} />
}

export function RolesTable() {
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertDescription>
          Assign roles to users in the <strong>Users</strong> tab so they can
          see menu items (Dashboard, Connection, API Dev, etc.). Users with no
          role see no sidebar menu.
        </AlertDescription>
      </Alert>
      <Suspense fallback={<PendingUsers />}>
        <RolesTableContent />
      </Suspense>
    </div>
  )
}
