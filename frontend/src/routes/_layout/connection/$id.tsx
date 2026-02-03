import { createFileRoute, Link, useNavigate, Outlet, useMatchRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Edit, Play, Trash2, ArrowLeft } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DataSourceService } from "@/services/datasource"
import useCustomToast from "@/hooks/useCustomToast"
import { usePermissions } from "@/hooks/usePermissions"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_layout/connection/$id")({
  component: ConnectionDetail,
  head: () => ({
    meta: [
      {
        title: "DataSource Detail",
      },
    ],
  }),
})

function ConnectionDetail() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { hasPermission } = usePermissions()
  const canUpdate = hasPermission("datasource", "update", id)
  const canDelete = hasPermission("datasource", "delete", id)
  const canExecute = hasPermission("datasource", "execute", id)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const matchRoute = useMatchRoute()
  
  // Check if we're on the edit route
  const isEditRoute = matchRoute({ to: "/connection/$id/edit" })

  const { data: datasource, isLoading } = useQuery({
    queryKey: ["datasource", id],
    queryFn: () => DataSourceService.get(id),
  })

  const testMutation = useMutation({
    mutationFn: () => DataSourceService.test(id),
    onSuccess: (result) => {
      if (result.ok) {
        showSuccessToast(result.message)
      } else {
        showErrorToast(result.message)
      }
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => DataSourceService.delete(id),
    onSuccess: () => {
      showSuccessToast("DataSource deleted successfully")
      navigate({ to: "/connection" })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  const toggleStatusMutation = useMutation({
    mutationFn: async () => {
      if (!datasource) throw new Error("DataSource not found")
      return DataSourceService.update({
        id: datasource.id,
        is_active: !datasource.is_active,
      })
    },
    onSuccess: (updated) => {
      if (updated.is_active) {
        showSuccessToast("DataSource activated successfully")
      } else {
        showErrorToast("DataSource has been deactivated", "Deactivated")
      }
      queryClient.invalidateQueries({ queryKey: ["datasource", id] })
      queryClient.invalidateQueries({ queryKey: ["datasources"] })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">Loading...</div>
    )
  }

  if (!datasource) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">DataSource not found</p>
        <Link to="/connection">
          <Button variant="outline" className="mt-4">
            Back to List
          </Button>
        </Link>
      </div>
    )
  }

  // If on edit route, only render Outlet (edit form)
  if (isEditRoute) {
    return <Outlet />
  }

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/connection">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{datasource.name}</h1>
            <p className="text-muted-foreground mt-1">Data Source Details</p>
          </div>
        </div>
        <div className="flex gap-2">
          {canUpdate && (
            <Link to="/connection/$id/edit" params={{ id }}>
              <Button variant="outline">
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </Link>
          )}
          {canExecute && (
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
            >
              <Play className="mr-2 h-4 w-4" />
              {testMutation.isPending ? "Testing..." : "Test Connection"}
            </Button>
          )}
          {canDelete && (
            <Button
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connection Information</CardTitle>
          <CardDescription>View connection details and status</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableHead className="w-[180px]">Name</TableHead>
                <TableCell>{datasource.name}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead className="w-[180px]">Database Type</TableHead>
                <TableCell>
                  <Badge variant="outline" className="uppercase">
                    {datasource.product_type}
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableHead className="w-[180px]">Host</TableHead>
                <TableCell className="font-mono">{datasource.host}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead className="w-[180px]">Port</TableHead>
                <TableCell>{datasource.port}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead className="w-[180px]">Database</TableHead>
                <TableCell className="font-mono">{datasource.database}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead className="w-[180px]">Username</TableHead>
                <TableCell className="font-mono">{datasource.username}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead className="w-[180px]">Password</TableHead>
                <TableCell className="font-mono text-muted-foreground">
                  ••••••••••••
                </TableCell>
              </TableRow>
              <TableRow>
                <TableHead className="w-[180px]">Status</TableHead>
                <TableCell>
                  <Button
                    variant="ghost"
                    className="h-auto p-0 hover:bg-transparent"
                    onClick={() => toggleStatusMutation.mutate()}
                    disabled={!canUpdate || toggleStatusMutation.isPending}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          datasource.is_active
                            ? "bg-green-500"
                            : "bg-gray-400",
                        )}
                      />
                      <span
                        className={
                          datasource.is_active ? "" : "text-muted-foreground"
                        }
                      >
                        {toggleStatusMutation.isPending
                          ? datasource.is_active
                            ? "Deactivating..."
                            : "Activating..."
                          : datasource.is_active
                            ? "Active"
                            : "Inactive"}
                      </span>
                    </div>
                  </Button>
                </TableCell>
              </TableRow>
              {datasource.description && (
                <TableRow>
                  <TableHead className="w-[180px]">Description</TableHead>
                  <TableCell>{datasource.description}</TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableHead className="w-[180px]">Created</TableHead>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(datasource.created_at).toLocaleString()}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableHead className="w-[180px]">Last Updated</TableHead>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(datasource.updated_at).toLocaleString()}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Data Source</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{datasource.name}"? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteMutation.mutate()
                setDeleteOpen(false)
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Outlet />
    </div>
  )
}
