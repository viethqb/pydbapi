import { createFileRoute, Link } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search, Loader2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { DataTable } from "@/components/Common/DataTable"
import { Badge } from "@/components/ui/badge"
import {
  apiColumns,
  type ApiTableData,
} from "@/components/ApiDev/api-columns"
import {
  ApiAssignmentsService,
  type ApiAssignmentListIn,
  type HttpMethodEnum,
  type ExecuteEngineEnum,
} from "@/services/api-assignments"
import { ModulesService } from "@/services/modules"
import { DataSourceService } from "@/services/datasource"
import useCustomToast from "@/hooks/useCustomToast"
import { usePermissions } from "@/hooks/usePermissions"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export const Route = createFileRoute("/_layout/api-dev/apis/")({
  component: ApisList,
  head: () => ({
    meta: [
      {
        title: "API List",
      },
    ],
  }),
})

function ApisList() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission("api_assignment", "create")
  const canUpdate = hasPermission("api_assignment", "update")
  const canDelete = hasPermission("api_assignment", "delete")

  // Filters state
  const [filters, setFilters] = useState<ApiAssignmentListIn>({
    page: 1,
    page_size: 20,
    module_id: null,
    is_published: null,
    name__ilike: null,
    http_method: null,
    execute_engine: null,
  })

  // Query for list
  const { data, isLoading } = useQuery({
    queryKey: ["api-assignments", filters],
    queryFn: () => ApiAssignmentsService.list(filters),
  })

  // Fetch modules and datasources for display
  const { data: modulesData } = useQuery({
    queryKey: ["modules-simple"],
    queryFn: () => ModulesService.listSimple(),
  })

  const { data: datasourcesData } = useQuery({
    queryKey: ["datasources-simple"],
    queryFn: () => DataSourceService.list({ page: 1, page_size: 100 }),
  })

  // Create maps for lookup
  const moduleMap = new Map(Array.isArray(modulesData) ? modulesData.map(m => [m.id, m.name]) : [])
  const modulePathPrefixMap = new Map(Array.isArray(modulesData) ? modulesData.map(m => [m.id, m.path_prefix]) : [])
  const datasourceMap = new Map(Array.isArray(datasourcesData?.data) ? datasourcesData.data.map(ds => [ds.id, ds.name]) : [])

  // Delete mutation
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const deleteMutation = useMutation({
    mutationFn: (id: string) => ApiAssignmentsService.delete(id),
    onSuccess: () => {
      showSuccessToast("API deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["api-assignments"] })
      setDeleteId(null)
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
      setDeleteId(null)
    },
  })

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: (id: string) => ApiAssignmentsService.publish({ id }),
    onSuccess: () => {
      showSuccessToast("API published successfully")
      queryClient.invalidateQueries({ queryKey: ["api-assignments"] })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  const handleDelete = (id: string) => {
    setDeleteId(id)
  }

  const handlePublish = (id: string) => {
    publishMutation.mutate(id)
  }

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId)
    }
  }

  const tableData: ApiTableData[] =
    (Array.isArray(data?.data) ? data.data : []).map((api) => ({
      ...api,
      module_name: moduleMap.get(api.module_id),
      module_path_prefix: modulePathPrefixMap.get(api.module_id),
      datasource_name: api.datasource_id ? datasourceMap.get(api.datasource_id) : undefined,
      onDelete: handleDelete,
      onPublish: handlePublish,
      canUpdate,
      canDelete,
    }))

  const page = filters.page ?? 1
  const pageSize = filters.page_size ?? 20
  const total = data?.total ?? 0

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">APIs</h1>
          <p className="text-muted-foreground mt-1">
            Search and manage all API assignments across modules
          </p>
        </div>
        {canCreate && (
          <Link to="/api-dev/apis/create">
            <Button size="lg">
              <Plus className="mr-2 h-4 w-4" />
              Create API
            </Button>
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search APIs by name, path, or description..."
              className="pl-8"
              value={filters.name__ilike || ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  name__ilike: e.target.value || null,
                  page: 1,
                })
              }
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <Select
            value={filters.module_id || "all"}
            onValueChange={(value) =>
              setFilters({
                ...filters,
                module_id: value === "all" ? null : value,
                page: 1,
              })
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Modules" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modules</SelectItem>
              {Array.isArray(modulesData) && modulesData.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={
              filters.is_published === null
                ? "all"
                : filters.is_published
                  ? "published"
                  : "draft"
            }
            onValueChange={(value) =>
              setFilters({
                ...filters,
                is_published:
                  value === "all" ? null : value === "published" ? true : false,
                page: 1,
              })
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.http_method || "all"}
            onValueChange={(value) =>
              setFilters({
                ...filters,
                http_method: value === "all" ? null : (value as HttpMethodEnum),
                page: 1,
              })
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Methods" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Methods</SelectItem>
              <SelectItem value="GET">GET</SelectItem>
              <SelectItem value="POST">POST</SelectItem>
              <SelectItem value="PUT">PUT</SelectItem>
              <SelectItem value="DELETE">DELETE</SelectItem>
              <SelectItem value="PATCH">PATCH</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.execute_engine || "all"}
            onValueChange={(value) =>
              setFilters({
                ...filters,
                execute_engine: value === "all" ? null : (value as ExecuteEngineEnum),
                page: 1,
              })
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Engines" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Engines</SelectItem>
              <SelectItem value="SQL">SQL</SelectItem>
              <SelectItem value="SCRIPT">SCRIPT</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {total > 0
            ? `${total} API${total > 1 ? "s" : ""} found`
            : "No APIs found"}
        </div>
        {total > 0 && (
          <Badge variant="outline" className="text-sm">
            Page {page} of {Math.ceil(total / pageSize)}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Loading APIs...</p>
        </div>
      ) : total === 0 ? (
        <div className="text-center py-12">
          <div className="text-muted-foreground mb-4">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No APIs found</p>
            <p className="text-sm mt-2">
              {filters.name__ilike || filters.module_id || filters.is_published !== null
                ? "Try adjusting your filters"
                : "Get started by creating your first API"}
            </p>
          </div>
          {canCreate && !filters.name__ilike && !filters.module_id && filters.is_published === null && (
            <Link to="/api-dev/apis/create">
              <Button className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Create API
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          <DataTable columns={apiColumns} data={tableData} />

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing{" "}
                <span className="font-medium">{(page - 1) * pageSize + 1}</span>{" "}
                to{" "}
                <span className="font-medium">{Math.min(page * pageSize, total)}</span>{" "}
                of <span className="font-medium">{total}</span> entries
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setFilters({ ...filters, page: page - 1 })}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * pageSize >= total}
                  onClick={() => setFilters({ ...filters, page: page + 1 })}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete API</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this API? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteId(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
