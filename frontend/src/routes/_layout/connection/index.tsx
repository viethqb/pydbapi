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
  columns,
  type DataSourceTableData,
} from "@/components/DataSource/columns"
import {
  DataSourceService,
  type DataSourceListIn,
  type ProductTypeEnum,
} from "@/services/datasource"
import useCustomToast from "@/hooks/useCustomToast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export const Route = createFileRoute("/_layout/connection/")({
  component: ConnectionList,
  head: () => ({
    meta: [
      {
        title: "Connection - DataSource List",
      },
    ],
  }),
})

function ConnectionList() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  // Filters state
  const [filters, setFilters] = useState<DataSourceListIn>({
    page: 1,
    page_size: 20,
    product_type: null,
    is_active: null,
    name__ilike: null,
  })

  // Query for list
  const { data, isLoading } = useQuery({
    queryKey: ["datasources", filters],
    queryFn: () => DataSourceService.list(filters),
  })

  // Test connection mutation
  const testMutation = useMutation({
    mutationFn: (id: string) => DataSourceService.test(id),
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

  // Delete mutation
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const deleteMutation = useMutation({
    mutationFn: (id: string) => DataSourceService.delete(id),
    onSuccess: () => {
      showSuccessToast("DataSource deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["datasources"] })
      setDeleteId(null)
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
      setDeleteId(null)
    },
  })

  // Toggle status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: boolean }) => {
      return DataSourceService.update({
        id,
        is_active: !currentStatus,
      })
    },
    onSuccess: (updated) => {
      if (updated.is_active) {
        showSuccessToast("DataSource activated successfully")
      } else {
        showErrorToast("DataSource has been deactivated", "Deactivated")
      }
      queryClient.invalidateQueries({ queryKey: ["datasources"] })
      queryClient.invalidateQueries({ queryKey: ["datasource", updated.id] })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  const handleTest = (id: string) => {
    testMutation.mutate(id)
  }

  const handleDelete = (id: string) => {
    setDeleteId(id)
  }

  const handleToggleStatus = (id: string, currentStatus: boolean) => {
    toggleStatusMutation.mutate({ id, currentStatus })
  }

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId)
    }
  }

  const tableData: DataSourceTableData[] =
    data?.data.map((ds) => ({
      ...ds,
      onTest: handleTest,
      onDelete: handleDelete,
      onToggleStatus: handleToggleStatus,
    })) || []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Data Sources</h1>
          <p className="text-muted-foreground">
            Manage your database connections
          </p>
        </div>
        <Link to="/connection/create">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Data Source
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name..."
              className="pl-8"
              value={filters.name__ilike || ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  name__ilike: e.target.value || null,
                  page: 1, // Reset to first page
                })
              }
            />
          </div>
        </div>
        <Select
          value={filters.product_type || "all"}
          onValueChange={(value) =>
            setFilters({
              ...filters,
              product_type: value === "all" ? null : (value as ProductTypeEnum),
              page: 1,
            })
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="postgres">PostgreSQL</SelectItem>
            <SelectItem value="mysql">MySQL</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={
            filters.is_active === null
              ? "all"
              : filters.is_active
                ? "active"
                : "inactive"
          }
          onValueChange={(value) =>
            setFilters({
              ...filters,
              is_active:
                value === "all" ? null : value === "active" ? true : false,
              page: 1,
            })
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* DataTable */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading...
        </div>
      ) : (
        <DataTable columns={columns} data={tableData} />
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
            <DialogTitle>Delete Data Source</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this data source? This action
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
