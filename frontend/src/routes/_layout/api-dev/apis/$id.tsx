import { createFileRoute, Link, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Globe, Pencil, Trash2, EyeOff } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { ApiAssignmentsService } from "@/services/api-assignments"
import { ModulesService } from "@/services/modules"
import { DataSourceService } from "@/services/datasource"
import { GroupsService } from "@/services/groups"
import useCustomToast from "@/hooks/useCustomToast"

export const Route = createFileRoute("/_layout/api-dev/apis/$id")({
  component: ApiDetail,
  head: () => ({
    meta: [
      {
        title: "API Detail",
      },
    ],
  }),
})

function ApiDetail() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const { handleSubmit } = useForm()

  // Check if we're on the edit route
  const isEditRoute = matchRoute({ to: "/api-dev/apis/$id/edit" })

  // Fetch API detail
  const { data: apiDetail, isLoading } = useQuery({
    queryKey: ["api-assignment", id],
    queryFn: () => ApiAssignmentsService.get(id),
    enabled: !isEditRoute, // Don't fetch when on edit route
  })

  // Fetch related data
  const { data: module } = useQuery({
    queryKey: ["module", apiDetail?.module_id],
    queryFn: () => apiDetail ? ModulesService.get(apiDetail.module_id) : null,
    enabled: !!apiDetail,
  })

  const { data: datasource } = useQuery({
    queryKey: ["datasource", apiDetail?.datasource_id],
    queryFn: () => apiDetail?.datasource_id ? DataSourceService.get(apiDetail.datasource_id) : null,
    enabled: !!apiDetail?.datasource_id,
  })

  const { data: groupsData } = useQuery({
    queryKey: ["groups-simple"],
    queryFn: () => GroupsService.list(),
  })

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: () => ApiAssignmentsService.publish({ id }),
    onSuccess: () => {
      showSuccessToast("API published successfully")
      queryClient.invalidateQueries({ queryKey: ["api-assignment", id] })
      queryClient.invalidateQueries({ queryKey: ["api-assignments"] })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  // Unpublish mutation
  const unpublishMutation = useMutation({
    mutationFn: () => ApiAssignmentsService.unpublish({ id }),
    onSuccess: () => {
      showSuccessToast("API unpublished successfully")
      queryClient.invalidateQueries({ queryKey: ["api-assignment", id] })
      queryClient.invalidateQueries({ queryKey: ["api-assignments"] })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => ApiAssignmentsService.delete(id),
    onSuccess: () => {
      showSuccessToast("API deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["api-assignments"] })
      navigate({ to: "/api-dev/apis" })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  const handlePublish = () => {
    publishMutation.mutate()
  }

  const handleUnpublish = () => {
    unpublishMutation.mutate()
  }

  const handleDelete = () => {
    deleteMutation.mutate()
  }

  // If on edit route, only render Outlet (edit form)
  if (isEditRoute) {
    return <Outlet />
  }

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>
  }

  if (!apiDetail) {
    return <div className="text-center py-8 text-muted-foreground">API not found</div>
  }

  const assignedGroups = groupsData?.data.filter(g => apiDetail.group_ids.includes(g.id)) || []
  const methodColors: Record<string, string> = {
    GET: "bg-blue-500",
    POST: "bg-green-500",
    PUT: "bg-yellow-500",
    DELETE: "bg-red-500",
    PATCH: "bg-purple-500",
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/api-dev/apis">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{apiDetail.name}</h1>
            <p className="text-muted-foreground">
              {apiDetail.description || "No description"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {apiDetail.is_published ? (
            <Button
              onClick={handleUnpublish}
              disabled={unpublishMutation.isPending}
              variant="outline"
            >
              <EyeOff className="mr-2 h-4 w-4" />
              Unpublish
            </Button>
          ) : (
            <Button
              onClick={handlePublish}
              disabled={publishMutation.isPending}
            >
              <Globe className="mr-2 h-4 w-4" />
              Publish
            </Button>
          )}
          <Link to="/api-dev/apis/$id/edit" params={{ id }}>
            <Button variant="outline">
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </Link>
          <Button
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* API Info */}
      <Card>
        <CardHeader>
          <CardTitle>API Information</CardTitle>
          <CardDescription>Details about this API assignment</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Module</p>
              <p>{module?.name || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Path</p>
              <p className="font-mono text-sm">{apiDetail.path}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">HTTP Method</p>
              <Badge className={methodColors[apiDetail.http_method] || "bg-gray-500"}>
                {apiDetail.http_method}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Execute Engine</p>
              <Badge variant="outline" className="uppercase">
                {apiDetail.execute_engine}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">DataSource</p>
              <p>{datasource?.name || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <Badge variant={apiDetail.is_published ? "default" : "outline"}>
                {apiDetail.is_published ? "Published" : "Draft"}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Sort Order</p>
              <p>{apiDetail.sort_order}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Updated</p>
              <p className="text-sm text-muted-foreground">
                {new Date(apiDetail.updated_at).toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Groups */}
      {assignedGroups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Assigned Groups</CardTitle>
            <CardDescription>Groups this API belongs to</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {assignedGroups.map((group) => (
                <Badge key={group.id} variant="outline">
                  {group.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content */}
      {apiDetail.api_context && (
        <Card>
          <CardHeader>
            <CardTitle>
              {apiDetail.execute_engine === "SQL" ? "SQL (Jinja2)" : "Python Script"}
            </CardTitle>
            <CardDescription>API execution content</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="p-4 bg-muted rounded-md overflow-auto max-h-[500px] font-mono text-sm">
              {apiDetail.api_context.content}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Render child routes (like edit) */}
      <Outlet />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit(handleDelete)}>
            <DialogHeader>
              <DialogTitle>Delete API</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete <strong>{apiDetail.name}</strong>? 
                This action cannot be undone. All associated data (context, groups, etc.) will be permanently deleted.
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
    </div>
  )
}
