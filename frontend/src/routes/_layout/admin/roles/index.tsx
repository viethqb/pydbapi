import { createFileRoute, Link } from "@tanstack/react-router"
import { useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query"
import { Eye, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react"
import { Suspense, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { RolesService, type RolePublic } from "@/services/roles"
import useCustomToast from "@/hooks/useCustomToast"
import PendingItems from "@/components/Pending/PendingItems"

export const Route = createFileRoute("/_layout/admin/roles/")({
  component: RolesPage,
  head: () => ({
    meta: [{ title: "Roles - Admin" }],
  }),
})

function RolesListContent() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [deleteRole, setDeleteRole] = useState<RolePublic | null>(null)

  const { data } = useSuspenseQuery({
    queryKey: ["roles"],
    queryFn: () => RolesService.list(),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => RolesService.delete(id),
    onSuccess: () => {
      showSuccessToast("Role deleted")
      queryClient.invalidateQueries({ queryKey: ["roles"] })
      setDeleteRole(null)
    },
    onError: (e: Error) => {
      showErrorToast(e.message)
      setDeleteRole(null)
    },
  })

  const roles = data?.data ?? []

  return (
    <div className="flex flex-col gap-0">
      <div className="bg-muted/50 border-b px-4 py-3 mb-4 rounded-t-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Roles</h1>
          <div className="flex items-center gap-2">
            <Link to="/admin/roles/create">
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Create role
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        {roles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldCheck className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground font-medium">No roles yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Create your first custom role with the button above, or ensure
              backend seeding has run (Admin, Alpha, Gamma, Operator).
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[80px] text-right">Users</TableHead>
                <TableHead className="w-[140px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role: RolePublic) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">
                    <Link
                      to="/admin/roles/$id"
                      params={{ id: role.id }}
                      className="hover:underline"
                    >
                      {role.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-md">
                    {role.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {role.user_count ?? 0}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            to="/admin/roles/$id"
                            params={{ id: role.id }}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          View details
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            to="/admin/roles/$id/edit"
                            params={{ id: role.id }}
                            onClick={() => {
                              console.log("[Roles list] Edit clicked, navigating to /admin/roles/$id/edit", {
                                roleId: role.id,
                                roleName: role.name,
                                targetPath: `/admin/roles/${role.id}/edit`,
                              })
                            }}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          Edit role
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteRole(role)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          Delete role
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog
        open={deleteRole !== null}
        onOpenChange={(open) => !open && setDeleteRole(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete role</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the role{" "}
              <strong>{deleteRole?.name}</strong>? This will remove the role
              from all users. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteRole(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteRole && deleteMutation.mutate(deleteRole.id)
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RolesPage() {
  return (
    <Suspense fallback={<PendingItems />}>
      <RolesListContent />
    </Suspense>
  )
}
