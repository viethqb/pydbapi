import { createFileRoute, Link, useNavigate, Outlet, useMatchRoute } from "@tanstack/react-router"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Edit, Play, Trash2, ArrowLeft } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
  const { showSuccessToast, showErrorToast } = useCustomToast()
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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/connection">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{datasource.name}</h1>
            <p className="text-muted-foreground">Data Source Details</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              console.log("Edit button clicked, id:", id)
              console.log("id type:", typeof id)
              console.log("id value:", id)
              if (!id) {
                console.error("ID is undefined or empty!")
                return
              }
              const editPath = `/connection/${id}/edit`
              console.log("Navigating to:", editPath)
              // Direct navigation using window.location to avoid route issues
              window.location.href = editPath
            }}
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
          >
            <Play className="mr-2 h-4 w-4" />
            {testMutation.isPending ? "Testing..." : "Test"}
          </Button>
          <Button
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connection Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Name
              </label>
              <p className="mt-1">{datasource.name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Type
              </label>
              <p className="mt-1">
                <Badge variant="outline" className="uppercase">
                  {datasource.product_type}
                </Badge>
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Host
              </label>
              <p className="mt-1">{datasource.host}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Port
              </label>
              <p className="mt-1">{datasource.port}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Database
              </label>
              <p className="mt-1">{datasource.database}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Username
              </label>
              <p className="mt-1">{datasource.username}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Password
              </label>
              <p className="mt-1 font-mono text-muted-foreground">
                ••••••••••••
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Status
              </label>
              <p className="mt-1">
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
                    {datasource.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </p>
            </div>
            {datasource.driver_version && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Driver Version
                </label>
                <p className="mt-1">{datasource.driver_version}</p>
              </div>
            )}
            {datasource.description && (
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Description
                </label>
                <p className="mt-1">{datasource.description}</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Created At
              </label>
              <p className="mt-1 text-sm text-muted-foreground">
                {new Date(datasource.created_at).toLocaleString()}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Updated At
              </label>
              <p className="mt-1 text-sm text-muted-foreground">
                {new Date(datasource.updated_at).toLocaleString()}
              </p>
            </div>
          </div>
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
