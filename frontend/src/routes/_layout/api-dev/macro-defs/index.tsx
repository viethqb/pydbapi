import { createFileRoute, Link } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search } from "lucide-react"
import { useMemo, useState } from "react"

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
  macroDefColumns,
  type MacroDefTableData,
} from "@/components/ApiDev/macro-columns"
import { MacroDefsService, type ApiMacroDefListIn } from "@/services/macro-defs"
import { ModulesService } from "@/services/modules"
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
import MacroExamples from "@/components/ApiDev/MacroExamples"

export const Route = createFileRoute("/_layout/api-dev/macro-defs/")({
  component: MacroDefsList,
  head: () => ({
    meta: [
      {
        title: "Macro definitions",
      },
    ],
  }),
})

function MacroDefsList() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission("macro_def", "create")
  const canUpdate = hasPermission("macro_def", "update")
  const canDelete = hasPermission("macro_def", "delete")

  const [filters, setFilters] = useState<ApiMacroDefListIn>({
    page: 1,
    page_size: 20,
    module_id: null,
    macro_type: null,
    name__ilike: null,
  })

  const { data, isLoading } = useQuery({
    queryKey: ["macro-defs", filters],
    queryFn: () => MacroDefsService.list(filters),
  })

  const { data: modules } = useQuery({
    queryKey: ["modules-simple"],
    queryFn: () => ModulesService.listSimple(),
  })

  const moduleMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const mod of modules ?? []) {
      m.set(mod.id, mod.name)
    }
    return m
  }, [modules])

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const deleteMutation = useMutation({
    mutationFn: (id: string) => MacroDefsService.delete(id),
    onSuccess: () => {
      showSuccessToast("Macro definition deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["macro-defs"] })
      setDeleteId(null)
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
      setDeleteId(null)
    },
  })

  const handleDelete = (id: string) => {
    setDeleteId(id)
  }

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId)
    }
  }

  const tableData: MacroDefTableData[] = (
    Array.isArray(data?.data) ? data.data : []
  ).map((m) => ({
    ...m,
    moduleName: m.module_id ? moduleMap.get(m.module_id) ?? null : null,
    onDelete: handleDelete,
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Macro definitions</h1>
          <p className="text-muted-foreground">
            Jinja macros and Python functions reusable in API content
          </p>
        </div>
        {canCreate && (
          <Link to="/api-dev/macro-defs/create">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create macro definition
            </Button>
          </Link>
        )}
      </div>

      <MacroExamples />

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
                  page: 1,
                })
              }
            />
          </div>
        </div>
        <Select
          value={filters.module_id ?? "all"}
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
            <SelectItem value="all">All (incl. Global)</SelectItem>
            {modules?.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.macro_type ?? "all"}
          onValueChange={(value) =>
            setFilters({
              ...filters,
              macro_type: value === "all" ? null : (value as "JINJA" | "PYTHON"),
              page: 1,
            })
          }
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="JINJA">Jinja</SelectItem>
            <SelectItem value="PYTHON">Python</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading...
        </div>
      ) : (
        <DataTable columns={macroDefColumns} data={tableData} />
      )}

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
              disabled={filters.page! * filters.page_size! >= data.total}
              onClick={() =>
                setFilters({ ...filters, page: (filters.page || 1) + 1 })
              }
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete macro definition</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this macro definition? APIs using it will no
              longer have access to it.
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
