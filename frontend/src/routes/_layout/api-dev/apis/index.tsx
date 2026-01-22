import { createFileRoute, Link } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search } from "lucide-react"
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
  const moduleMap = new Map(modulesData?.map(m => [m.id, m.name]) || [])
  const datasourceMap = new Map(datasourcesData?.data.map(ds => [ds.id, ds.name]) || [])

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
    data?.data.map((api) => ({
      ...api,
      module_name: moduleMap.get(api.module_id),
      datasource_name: api.datasource_id ? datasourceMap.get(api.datasource_id) : undefined,
      onDelete: handleDelete,
      onPublish: handlePublish,
    })) || []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">APIs</h2>
          <p className="text-muted-foreground text-sm">
            Search and manage all API assignments across modules
          </p>
        </div>
        <Link to="/api-dev/apis/create">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create API
          </Button>
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-4">
        {/* Search Box - Prominent */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search APIs by name, path, or description..."
            className="pl-10 h-10"
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
        
        {/* Other Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
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
              {modulesData?.map((m) => (
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

      {/* DataTable */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading...
        </div>
      ) : (
        <DataTable columns={apiColumns} data={tableData} />
      )}

      {/* Pagination */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {(filters.page! - 1) * filters.page_size! + 1} to{" "}
            {Math.min(filters.page! * filters.page_size!, data.total)} of{" "}
            {data.total} entries
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page === 1}
              onClick={() =>
                setFilters({ ...filters, page: (filters.page || 1) - 1 })
              }
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={
                filters.page! * filters.page_size! >= data.total
              }
              onClick={() =>
                setFilters({ ...filters, page: (filters.page || 1) + 1 })
              }
            >
              Next
            </Button>
          </div>
        </div>
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
