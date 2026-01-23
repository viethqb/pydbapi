import { createFileRoute, Link, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, ArrowLeft } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/Common/DataTable"
import {
  apiColumns,
  type ApiTableData,
} from "@/components/ApiDev/api-columns"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LoadingButton } from "@/components/ui/loading-button"
import { ModulesService } from "@/services/modules"
import { ApiAssignmentsService } from "@/services/api-assignments"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import useCustomToast from "@/hooks/useCustomToast"

export const Route = createFileRoute("/_layout/api-dev/modules/$id")({
  component: ModuleDetail,
  head: () => ({
    meta: [
      {
        title: "Module Detail",
      },
    ],
  }),
})

function ModuleDetail() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteApiId, setDeleteApiId] = useState<string | null>(null)
  
  // Check if we're on the edit route
  const isEditRoute = matchRoute({ to: "/api-dev/modules/$id/edit" })

  // Fetch module detail
  const { data: module, isLoading: moduleLoading } = useQuery({
    queryKey: ["module", id],
    queryFn: () => ModulesService.get(id),
  })

  // Fetch APIs in this module
  const { data: apisData, isLoading: apisLoading } = useQuery({
    queryKey: ["api-assignments", { module_id: id }],
    queryFn: () => ApiAssignmentsService.list({
      module_id: id,
      page: 1,
      page_size: 100,
    }),
    enabled: !isEditRoute, // Don't fetch APIs when on edit route
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => ModulesService.delete(id),
    onSuccess: () => {
      showSuccessToast("Module deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["modules"] })
      navigate({ to: "/api-dev/modules" })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  // Delete API mutation
  const deleteApiMutation = useMutation({
    mutationFn: (apiId: string) => ApiAssignmentsService.delete(apiId),
    onSuccess: () => {
      showSuccessToast("API deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["api-assignments", { module_id: id }] })
      queryClient.invalidateQueries({ queryKey: ["api-assignments"] })
      setDeleteApiId(null)
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
      setDeleteApiId(null)
    },
  })

  // Publish API mutation
  const publishApiMutation = useMutation({
    mutationFn: (apiId: string) => ApiAssignmentsService.publish({ id: apiId }),
    onSuccess: () => {
      showSuccessToast("API published successfully")
      queryClient.invalidateQueries({ queryKey: ["api-assignments", { module_id: id }] })
      queryClient.invalidateQueries({ queryKey: ["api-assignments"] })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  // If on edit route, only render Outlet (edit form)
  if (isEditRoute) {
    return <Outlet />
  }

  if (moduleLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>
  }

  if (!module) {
    return <div className="text-center py-8 text-muted-foreground">Module not found</div>
  }

  const handleDelete = () => {
    deleteMutation.mutate()
  }

  const handleDeleteApi = (apiId: string) => {
    setDeleteApiId(apiId)
  }

  const handlePublishApi = (apiId: string) => {
    publishApiMutation.mutate(apiId)
  }

  const confirmDeleteApi = () => {
    if (deleteApiId) {
      deleteApiMutation.mutate(deleteApiId)
    }
  }

  const tableData: ApiTableData[] =
    apisData?.data.map((api) => ({
      ...api,
      module_name: module.name,
      onDelete: handleDeleteApi,
      onPublish: handlePublishApi,
    })) || []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/api-dev/modules">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{module.name}</h1>
            <p className="text-muted-foreground">
              {module.description || "No description"}
            </p>
          </div>
        </div>
        <Link to="/api-dev/apis/create" search={{ module_id: id }}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create API
          </Button>
        </Link>
      </div>

      {/* Module Info */}
      <Card>
        <CardHeader>
          <CardTitle>Module Information</CardTitle>
          <CardDescription>Details about this API module</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Path Prefix</p>
              <p className="font-mono text-sm">{module.path_prefix}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Sort Order</p>
              <p>{module.sort_order}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <Badge variant={module.is_active ? "default" : "outline"}>
                {module.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Updated</p>
              <p className="text-sm text-muted-foreground">
                {new Date(module.updated_at).toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* APIs in Module */}
      <div>
        <h2 className="text-xl font-semibold mb-4">APIs in this Module</h2>
        {apisLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading APIs...
          </div>
        ) : (
          <DataTable columns={apiColumns} data={tableData} />
        )}
      </div>

      {/* Render child routes (like edit) */}
      <Outlet />

      {/* Delete Module Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(e) => { e.preventDefault(); handleDelete(); }}>
            <DialogHeader>
              <DialogTitle>Delete Module</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete <strong>{module.name}</strong>? 
                This action cannot be undone. All APIs in this module will also be deleted.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button variant="outline" disabled={deleteMutation.isPending}>
                  Cancel
                </Button>
              </DialogClose>
              <LoadingButton
                variant="destructive"
                type="submit"
                loading={deleteMutation.isPending}
              >
                Delete
              </LoadingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete API Confirmation Dialog */}
      <Dialog open={deleteApiId !== null} onOpenChange={(open) => !open && setDeleteApiId(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(e) => { e.preventDefault(); confirmDeleteApi() }}>
            <DialogHeader>
              <DialogTitle>Delete API</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this API? 
                This action cannot be undone. All associated data will be permanently deleted.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button variant="outline" disabled={deleteApiMutation.isPending}>
                  Cancel
                </Button>
              </DialogClose>
              <LoadingButton
                variant="destructive"
                type="submit"
                loading={deleteApiMutation.isPending}
              >
                Delete
              </LoadingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
