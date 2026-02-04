import { useQuery } from "@tanstack/react-query"
import { EllipsisVertical, Users } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Can } from "@/components/Common/Can"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { RolesService, type RolePublic } from "@/services/roles"
import { EditRolePermissions } from "./EditRolePermissions"

interface RoleActionsMenuProps {
  role: RolePublic
  onSuccess?: () => void
}

export function RoleActionsMenu({ role }: RoleActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const [usersDialogOpen, setUsersDialogOpen] = useState(false)

  const { data: usersData, isLoading } = useQuery({
    queryKey: ["roleUsers", role.id],
    queryFn: () => RolesService.getRoleUsers(role.id),
    enabled: usersDialogOpen,
  })

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <Can permission="users:write">
            <EditRolePermissions role={role} onSuccess={() => setOpen(false)} />
          </Can>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              setUsersDialogOpen(true)
            }}
          >
            <Users className="mr-2 size-4" />
            View users
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={usersDialogOpen} onOpenChange={setUsersDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Users in role: {role.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto py-2">
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : usersData?.data?.length ? (
              <ul className="space-y-1 text-sm">
                {usersData.data.map((u) => (
                  <li key={u.id}>
                    <span className="font-medium">{u.full_name || "—"}</span>
                    <span className="text-muted-foreground"> ({u.email})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                No users assigned to this role. Assign roles in the Users tab.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
