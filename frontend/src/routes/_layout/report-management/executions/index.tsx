import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Download } from "lucide-react"
import { useCallback, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { API_BASE, getAuthToken } from "@/lib/api-request"
import {
  type ReportExecutionListIn,
  ReportExecutionsService,
  ReportModuleService,
} from "@/services/report"

export const Route = createFileRoute(
  "/_layout/report-management/executions/",
)({
  component: ExecutionsPage,
  head: () => ({
    meta: [{ title: "Executions - Report Management" }],
  }),
})

function ExecutionsPage() {
  const [filters, setFilters] = useState<ReportExecutionListIn>({
    page: 1,
    page_size: 50,
    status: null,
    module_id: null,
    template_id: null,
  })

  const { data, isLoading } = useQuery({
    queryKey: ["report-executions", filters],
    queryFn: () => ReportExecutionsService.list(filters),
    refetchInterval: (query) => {
      const execs = query.state.data?.data
      if (execs?.some((e) => e.status === "pending" || e.status === "running")) {
        return 3000
      }
      return false
    },
  })

  // Fetch modules for filter dropdown + name lookup
  const { data: modulesData } = useQuery({
    queryKey: ["report-modules-all"],
    queryFn: () => ReportModuleService.list({ page: 1, page_size: 100 }),
  })
  const modules = modulesData?.data ?? []
  const moduleMap = Object.fromEntries(modules.map((m) => [m.id, m.name]))

  // Build template→module mapping from module details
  const { data: moduleDetails } = useQuery({
    queryKey: ["report-modules-details", modules.map((m) => m.id).join(",")],
    queryFn: async () => {
      const details = await Promise.all(
        modules.map((m) => ReportModuleService.get(m.id)),
      )
      const map: Record<string, { moduleName: string; templateName: string }> = {}
      for (const mod of details) {
        for (const tpl of mod.templates) {
          map[tpl.id] = { moduleName: mod.name, templateName: tpl.name }
        }
      }
      return map
    },
    enabled: modules.length > 0,
  })
  const templateLookup = moduleDetails ?? {}

  const statusColor = (status: string) => {
    switch (status) {
      case "success":
        return "default" as const
      case "failed":
        return "destructive" as const
      case "running":
        return "secondary" as const
      default:
        return "outline" as const
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Report Executions</h1>
        <p className="text-muted-foreground">
          View all report generation executions across all modules
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Select
          value={filters.status || "all"}
          onValueChange={(value) =>
            setFilters({
              ...filters,
              status: value === "all" ? null : value,
              page: 1,
            })
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

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
            {modules.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.template_id || "all"}
          onValueChange={(value) =>
            setFilters({
              ...filters,
              template_id: value === "all" ? null : value,
              page: 1,
            })
          }
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All Templates" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Templates</SelectItem>
            {Object.entries(templateLookup).map(([tid, info]) => (
              <SelectItem key={tid} value={tid}>
                {info.moduleName} / {info.templateName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading...
        </div>
      ) : data?.data && data.data.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Parameters</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Completed</TableHead>
              <TableHead>Download</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.map((exec) => {
              const lookup = templateLookup[exec.report_template_id]
              return (
                <TableRow key={exec.id}>
                  <TableCell>
                    <Badge variant={statusColor(exec.status)}>
                      {exec.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {lookup?.moduleName ?? "-"}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {lookup?.templateName ?? exec.report_template_id.slice(0, 8) + "..."}
                  </TableCell>
                  <TableCell
                    className="font-mono text-xs max-w-[150px] truncate"
                    title={
                      exec.parameters
                        ? JSON.stringify(exec.parameters)
                        : ""
                    }
                  >
                    {exec.parameters
                      ? JSON.stringify(exec.parameters).slice(0, 40)
                      : "--"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {exec.started_at
                      ? new Date(exec.started_at).toLocaleString()
                      : "--"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {exec.completed_at
                      ? new Date(exec.completed_at).toLocaleString()
                      : "--"}
                  </TableCell>
                  <TableCell>
                    {exec.status === "success" && exec.output_minio_path ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          const t = await getAuthToken()
                          const resp = await fetch(
                            `${API_BASE}/api/v1/report-executions/${exec.id}/download`,
                            { headers: t ? { Authorization: `Bearer ${t}` } : {} },
                          )
                          if (!resp.ok) return
                          const blob = await resp.blob()
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement("a")
                          a.href = url
                          a.download = exec.output_minio_path?.split("/").pop() || "report.xlsx"
                          a.click()
                          URL.revokeObjectURL(url)
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-sm">--</span>
                    )}
                  </TableCell>
                  <TableCell
                    className="text-sm text-destructive max-w-[200px] truncate"
                    title={exec.error_message || ""}
                  >
                    {exec.error_message || "--"}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          No executions found.
        </div>
      )}

      {/* Pagination */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing{" "}
            {((filters.page || 1) - 1) * (filters.page_size || 50) + 1} to{" "}
            {Math.min(
              (filters.page || 1) * (filters.page_size || 50),
              data.total,
            )}{" "}
            of {data.total} entries
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
                (filters.page || 1) * (filters.page_size || 50) >= data.total
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
    </div>
  )
}
