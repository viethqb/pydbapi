import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Loader2, Plus, Search } from "lucide-react"
import { useState } from "react"
import { DataTable } from "@/components/Common/DataTable"
import {
  type ModuleTableData,
  reportModulesColumns,
} from "@/components/ReportManagement/report-modules-columns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import useCustomToast from "@/hooks/useCustomToast"
import { usePermissions } from "@/hooks/usePermissions"
import { type ReportModuleListIn, ReportModuleService } from "@/services/report"

export const Route = createFileRoute("/_layout/report-management/modules/")({
  component: ModulesPage,
  head: () => ({
    meta: [{ title: "Report Modules" }],
  }),
})

function ModulesPage() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission("report_module", "create")
  const canUpdate = hasPermission("report_module", "update")
  const canDelete = hasPermission("report_module", "delete")

  const [filters, setFilters] = useState<ReportModuleListIn>({
    page: 1,
    page_size: 20,
    name__ilike: null,
    is_active: null,
  })

  const { data, isLoading } = useQuery({
    queryKey: ["report-modules", filters],
    queryFn: () => ReportModuleService.list(filters),
  })

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const deleteMutation = useMutation({
    mutationFn: (id: string) => ReportModuleService.delete(id),
    onSuccess: () => {
      showSuccessToast("Module deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["report-modules"] })
      setDeleteId(null)
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
      setDeleteId(null)
    },
  })

  const toggleStatusMutation = useMutation({
    mutationFn: ({
      id,
      currentStatus,
    }: {
      id: string
      currentStatus: boolean
    }) => ReportModuleService.update({ id, is_active: !currentStatus }),
    onSuccess: (updated) => {
      if (updated.is_active) {
        showSuccessToast("Module activated successfully")
      } else {
        showErrorToast("Module has been deactivated", "Deactivated")
      }
      queryClient.invalidateQueries({ queryKey: ["report-modules"] })
    },
    onError: (error: Error) => showErrorToast(error.message),
  })

  const tableData: ModuleTableData[] = (
    Array.isArray(data?.data) ? data.data : []
  ).map((mod) => ({
    ...mod,
    onEdit: () => {},
    onDelete: (id: string) => setDeleteId(id),
    onToggleStatus: (id: string, currentStatus: boolean) =>
      toggleStatusMutation.mutate({ id, currentStatus }),
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
          <h1 className="text-3xl font-bold tracking-tight">Report Modules</h1>
          <p className="text-muted-foreground mt-1">
            Manage report modules with MinIO and SQL datasource connections
          </p>
        </div>
        {canCreate && (
          <Link to="/report-management/modules/create">
            <Button size="lg">
              <Plus className="mr-2 h-4 w-4" />
              Create Module
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
              placeholder="Search modules by name..."
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
                is_active: value === "all" ? null : value === "active",
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
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {total > 0
            ? `${total} module${total > 1 ? "s" : ""} found`
            : "No modules found"}
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
          <p className="text-muted-foreground">Loading modules...</p>
        </div>
      ) : total === 0 ? (
        <div className="text-center py-12">
          <div className="text-muted-foreground mb-4">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No modules found</p>
            <p className="text-sm mt-2">
              {filters.name__ilike || filters.is_active !== null
                ? "Try adjusting your filters"
                : "Get started by creating your first report module"}
            </p>
          </div>
          {canCreate && !filters.name__ilike && filters.is_active === null && (
            <Link to="/report-management/modules/create">
              <Button className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Create Module
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          <DataTable columns={reportModulesColumns} data={tableData} />

          {total > 0 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing{" "}
                <span className="font-medium">{(page - 1) * pageSize + 1}</span>{" "}
                to{" "}
                <span className="font-medium">
                  {Math.min(page * pageSize, total)}
                </span>{" "}
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
            <DialogTitle>Delete Module</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this module? All templates,
              mappings, and execution history will be permanently removed.
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
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
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
