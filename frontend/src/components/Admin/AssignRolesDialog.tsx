import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Shield } from "lucide-react"
import { useEffect, useState } from "react"

import type { UserPublic } from "@/client"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { LoadingButton } from "@/components/ui/loading-button"
import { RolesService } from "@/services/roles"
import { UserPermissionsService } from "@/services/user-permissions"
import useCustomToast from "@/hooks/useCustomToast"

interface AssignRolesDialogProps {
  user: UserPublic
  onSuccess: () => void
}

export default function AssignRolesDialog({ user, onSuccess }: AssignRolesDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const { data: rolesData } = useQuery({
    queryKey: ["roles"],
    queryFn: () => RolesService.list(),
    enabled: open,
  })

  const { data: userRolesData } = useQuery({
    queryKey: ["userRoles", user.id],
    queryFn: () => UserPermissionsService.getUserRoles(user.id),
    enabled: open,
  })

  const roles = rolesData?.data ?? []
  const currentRoleIds = userRolesData?.role_ids ?? []

  useEffect(() => {
    if (open && userRolesData) {
      setSelectedIds(new Set(userRolesData.role_ids))
    }
  }, [open, userRolesData])

  const updateMutation = useMutation({
    mutationFn: (roleIds: string[]) =>
      UserPermissionsService.updateUserRoles(user.id, roleIds),
    onSuccess: () => {
      showSuccessToast("Roles updated successfully")
      queryClient.invalidateQueries({ queryKey: ["userRoles", user.id] })
      queryClient.invalidateQueries({ queryKey: ["users"] })
      setOpen(false)
      onSuccess()
    },
    onError: (e: Error) => showErrorToast(e.message),
  })

  const openDialog = () => {
    setSelectedIds(new Set(currentRoleIds))
    setOpen(true)
  }

  const toggleRole = (roleId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(roleId)
      else next.delete(roleId)
      return next
    })
  }

  const handleSave = () => {
    updateMutation.mutate(Array.from(selectedIds))
  }

  return (
    <>
      <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={openDialog}>
        <Shield className="mr-2 h-4 w-4" />
        Assign roles
      </DropdownMenuItem>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign roles</DialogTitle>
            <DialogDescription>
              Select roles for {user.full_name || user.email}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {roles.map((role) => (
              <div key={role.id} className="flex items-center gap-2">
                <Checkbox
                  id={`role-${role.id}`}
                  checked={selectedIds.has(role.id)}
                  onCheckedChange={(v) => toggleRole(role.id, v === true)}
                />
                <label
                  htmlFor={`role-${role.id}`}
                  className="text-sm font-medium leading-none cursor-pointer"
                >
                  {role.name}
                  {role.description ? (
                    <span className="text-muted-foreground font-normal ml-1">
                      — {role.description}
                    </span>
                  ) : null}
                </label>
              </div>
            ))}
            {roles.length === 0 && (
              <p className="text-sm text-muted-foreground">No roles available</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <LoadingButton
              onClick={handleSave}
              loading={updateMutation.isPending}
              disabled={roles.length === 0}
            >
              Save
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
