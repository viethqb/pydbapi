import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Search, Loader2, BookOpen } from "lucide-react"
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
  ApiAssignmentsService,
  type ApiAssignmentListIn,
  type HttpMethodEnum,
} from "@/services/api-assignments"
import { ModulesService } from "@/services/modules"
import type { ColumnDef } from "@tanstack/react-table"
import type { ApiAssignmentPublic } from "@/services/api-assignments"

type ApiRepositoryTableData = ApiAssignmentPublic & {
  module_name?: string
  module_path_prefix?: string
}

const repositoryColumns: ColumnDef<ApiRepositoryTableData>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      const id = row.original.id
      return (
        <Link
          to="/api-repository/$id"
          params={{ id }}
          className="font-medium hover:underline"
        >
          {row.original.name}
        </Link>
      )
    },
  },
  {
    accessorKey: "module_name",
    header: "Module",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.module_name || "-"}
      </span>
    ),
  },
  {
    accessorKey: "path",
    header: "Path",
    cell: ({ row }) => {
      const api = row.original
      const apiPath = api.path.startsWith("/") ? api.path.slice(1) : api.path
      const isRootModule = !api.module_path_prefix || api.module_path_prefix.trim() === "/"
      const fullPath = isRootModule ? `/${apiPath}` : `/${api.module_path_prefix.trim().replace(/^\/+|\/+$/g, "")}/${apiPath}`
      
      return (
        <span className="font-mono text-sm">
          {fullPath}
        </span>
      )
    },
  },
  {
    accessorKey: "http_method",
    header: "Method",
    cell: ({ row }) => {
      const method = row.original.http_method
      const colors: Record<string, string> = {
        GET: "bg-blue-500",
        POST: "bg-green-500",
        PUT: "bg-yellow-500",
        DELETE: "bg-red-500",
        PATCH: "bg-purple-500",
      }
      return (
        <Badge className={colors[method] || "bg-gray-500"}>
          {method}
        </Badge>
      )
    },
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {row.original.description || "-"}
      </span>
    ),
  },
  {
    accessorKey: "access_type",
    header: "Access",
    cell: ({ row }) => {
      const accessType = row.original.access_type || "private"
      return (
        <Badge variant={accessType === "public" ? "default" : "secondary"}>
          {accessType === "public" ? "Public" : "Private"}
        </Badge>
      )
    },
  },
]

export const Route = createFileRoute("/_layout/api-repository/")({
  component: ApiRepository,
  head: () => ({
    meta: [
      {
        title: "API Repository",
      },
    ],
  }),
})

function ApiRepository() {
  // Filters state - only show published APIs
  const [filters, setFilters] = useState<ApiAssignmentListIn>({
    page: 1,
    page_size: 20,
    module_id: null,
    is_published: true, // Only published APIs
    name__ilike: null,
    http_method: null,
    execute_engine: null,
  })

  // Query for list
  const { data, isLoading } = useQuery({
    queryKey: ["api-repository", filters],
    queryFn: () => ApiAssignmentsService.list(filters),
  })

  // Fetch modules for display
  const { data: modulesData } = useQuery({
    queryKey: ["modules-simple"],
    queryFn: () => ModulesService.listSimple(),
  })

  // Create maps for lookup
  const moduleMap = new Map(Array.isArray(modulesData) ? modulesData.map(m => [m.id, m.name]) : [])
  const modulePathPrefixMap = new Map(Array.isArray(modulesData) ? modulesData.map(m => [m.id, m.path_prefix]) : [])

  const tableData: ApiRepositoryTableData[] =
    (Array.isArray(data?.data) ? data.data : []).map((api) => ({
      ...api,
      module_name: moduleMap.get(api.module_id),
      module_path_prefix: modulePathPrefixMap.get(api.module_id),
    }))

  const page = filters.page ?? 1
  const pageSize = filters.page_size ?? 20
  const total = data?.total ?? 0

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API Repository</h1>
          <p className="text-muted-foreground mt-1">
            Search and browse published APIs
          </p>
        </div>
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
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No published APIs found</p>
            <p className="text-sm mt-2">
              {filters.name__ilike || filters.module_id || filters.http_method
                ? "Try adjusting your filters"
                : "No APIs have been published yet"}
            </p>
          </div>
        </div>
      ) : (
        <>
          <DataTable columns={repositoryColumns} data={tableData} />

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing{" "}
                <span className="font-medium">
                  {(page - 1) * pageSize + 1}
                </span>{" "}
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
                  onClick={() =>
                    setFilters({ ...filters, page: page - 1 })
                  }
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * pageSize >= total}
                  onClick={() =>
                    setFilters({ ...filters, page: page + 1 })
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
